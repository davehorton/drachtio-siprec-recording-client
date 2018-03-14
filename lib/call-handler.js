const config = require('config');
const Mrf = require('drachtio-fsmrf');
const SipError = require('drachtio-srf').SipError;
const constructSiprecPayload = require('./payload-combiner');
const debug = require('debug')('drachtio:siprec-recording-server');

module.exports = (req, res) => {
  const callid = req.get('Call-Id');
  const logger = req.app.locals.logger.child({callid});

  logger.info(`received INVITE from ${req.source_address}`);

  const srf = req.srf;
  const mrf = new Mrf(srf);
  const opts = { srf, req, logger, sdp: req.body };

  mrf.connect(config.get('freeswitch'))
    .then(createEndpoints.bind(null, opts))
    .then(createConference.bind(null, opts))
    .then(joinEndpoints.bind(null, opts))
    .then(connectCall.bind(null, opts, req, res, req.uri))
    .then(connectSiprec.bind(null, opts))
    .then((opts) => {
      opts.uac.on('destroy', () => {
        logger.info('callee hung up, ending call');
        opts.uas.destroy();
        cleanup(opts);
      });
      opts.uas.on('destroy', () => {
        logger.info('caller hung up, ending call');
        opts.uac.destroy();
        cleanup(opts);
      });
      return ;
    })
    .catch((err) => {
      if (err instanceof SipError && err.status === 407) {
        logger.info(`INVITE challenged with ${err.status}`);
      }
      else {
        logger.error(`Error connecting call: ${err}, ${err.stack}`);
      }
      if (!res.finalResponseSent) res.send(480);
      cleanup(opts);
    });
};

function createEndpoints(opts, ms) {
  opts.ms = ms;

  return Promise.all([
    ms.createEndpoint({headers: {'X-leg': 'incoming'}, remoteSdp: opts.sdp}),
    opts.ms.createEndpoint({headers: {'X-leg': 'siprecCaller'}}),
    opts.ms.createEndpoint({headers: {'X-leg': 'siprecCallee'}}),
    opts.ms.createEndpoint({headers: {'X-leg': 'outgoing'}})
  ]);
}
function createConference(opts, arr) {
  [opts.epIncoming, opts.epSiprecCaller, opts.epSiprecCallee, opts.epOutgoing] = arr;
  return opts.ms.createConference();
}
function joinEndpoints(opts, conf) {
  opts.logger.info(`created conference: ${conf.name}`);
  opts.conf = conf;
  return opts.epIncoming.join(conf)
    .then(({memberId}) => {
      opts.logger.info(`incoming member id ${memberId}`);
      opts.memberIdIncoming = memberId;
      return opts.epOutgoing.join(conf);
    })
    .then(({memberId}) => {
      opts.logger.info(`outgoing member id ${memberId}`);
      opts.memberIdOutgoing = memberId;
      return opts.epSiprecCaller.join(conf, {flags: {mute: true}});
    })
    .then(({memberId}) => {
      opts.logger.info(`siprecCaller member id ${memberId}`);
      opts.memberIdSiprecCaller = memberId;
      return opts.epSiprecCallee.join(conf, {flags: {mute: true}});
    })
    .then(({memberId}) => {
      opts.logger.info(`siprecCallee member id ${memberId}`);
      opts.memberIdSiprecCallee = memberId;
      const args = `${conf.name} relate ${opts.memberIdSiprecCaller} ${opts.memberIdOutgoing} nohear`;
      opts.logger.info(`${args}`);
      return conf.endpoint.api('conference', args);
    })
    .then((evt) => {
      opts.logger.info(`response to conference relate cmd: ${JSON.stringify(evt)}`);
      const args = `${conf.name} relate ${opts.memberIdSiprecCallee} ${opts.memberIdIncoming} nohear`;
      opts.logger.info(`${args}`);
      return conf.endpoint.api('conference', args);
    });
}
function connectCall(opts, req, res, uri) {
  opts.logger.info(`outdialing ${uri}`);
  return opts.srf.createB2BUA(req, res, uri, {
    localSdpB: opts.epOutgoing.local.sdp,
    localSdpA: opts.epIncoming.local.sdp,
    proxyRequestHeaders: ['Proxy-Authorization'],
    proxyResponseHeaders: ['Proxy-Authenticate', 'Allow-Events', 'Allow']
  },
  {
    cbProvisional: (res) => {
      if (res.statusCode >= 180 && res.get('Content-Type') === 'application/sdp') {
        opts.remoteSdp = res.body;
        opts.promiseModify = opts.epOutgoing.modify(opts.remoteSdp);
      }
    }
  });
}
function connectSiprec(opts, {uas, uac}) {
  Object.assign(opts, {uas, uac});

  // if we re-INVITEd the outoing-facing endpoint, wait till that resolves
  // before potentially re-INVITING it again with the final sdp
  return (opts.promiseModify || Promise.resolve())
    .then(() => {
      if (uac.remote.sdp !== opts.remoteSdp) {
        debug('got different SDP in final response, reINVITing FS');
        opts.remoteSdp = uac.remote.sdp;
        opts.epOutgoing.modify(opts.remoteSdp);
      }
      opts.logger.info('successfully connected caller, now attempting siprec INVITE');
      const boundary = 'uniqueBoundary';
      const sdp = constructSiprecPayload(opts, `--${boundary}`);
      opts.logger.info(`siprec body: ${sdp}`);
      return opts.srf.createUAC(config.get('siprec-server'), {
        localSdp: sdp,
        headers: {
          'Content-Type': `multipart/mixed;boundary=${boundary}`
        }
      });
    })
    .then((uac) => {
      opts.logger.info('successfully connected siprec');
      opts.uacSiprec = uac ;

      // parse out two remote media endpoints
      const arr = /^([^]+)(m=[^]+?)(m=[^]+?)$/.exec(uac.remote.sdp) ;
      const sdp1 = `${arr[1]}${arr[2]}` ;
      const sdp2 = `${arr[1]}${arr[3]}` ;

      return Promise.all([
        opts.epSiprecCaller.modify(sdp1),
        opts.epSiprecCallee.modify(sdp2)
      ]);
    })
    .then((arr) => {
      return opts;
    })
    .catch((err) => {
      opts.logger.error(`Error connecting siprec INVITE: ${err}; call will continue`);
      return opts;
    });
}
function cleanup(opts) {
  if (!opts.cleaned) {
    opts.cleaned = true;
    opts.logger.info('ending call');
    [
      opts.epIncoming,
      opts.epOutgoing,
      opts.epSiprecCaller,
      opts.epSiprecCallee,
      opts.uacSiprec,
      opts.conf
    ].forEach((resource) => {
      if (resource) resource.destroy();
    });
    if (opts.ms) opts.ms.disconnect();
  }
}
