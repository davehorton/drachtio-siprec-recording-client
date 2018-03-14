const config = require('config');
const pino = require('pino');
const Srf = require('drachtio-srf');
const srf = new Srf();
const _ = require('lodash');
const callHandler = require('./lib/call-handler');
const localHostPorts = [];

const logger = srf.locals.logger = pino({serializers: {err: pino.stdSerializers.err}});

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

// support either inbound or outbound connections based on config
if (config.has('drachtio.host')) {
  srf.connect(config.get('drachtio'));
  srf
    .on('connect', (err, hostport) => {
      hostport.split(',').map((hp) => {
        const arr = /([a-z]+)\/([0-9\.]+):(\d+)/.exec(hp);
        localHostPorts.push({host: arr[2], port: arr[3]});
      });
      logger.info(`successfully connected to drachtio listening on ${JSON.stringify(localHostPorts)}`);
    })
    .on('error', (err) => {
      logger.info(`error connecting to drachtio: ${err}`);
    });
}
else {
  logger.info(`listening for connections from drachtio on port ${config.get('drachtio.port')}`);
  srf.listen(config.get('drachtio'));
}

// reject INVITEs addressed to us since we should be positioned as an outbound proxy
srf.use((req, res, next) => {
  const uri = Srf.parseUri(req.uri);
  if (uri) {
    if (_.find(config.get('local-dns-names'), (nm) => {return nm === uri.host;}) ||
        _.find(localHostPorts, (hp) => { return hp.host === uri.host && hp.port == (uri.port || 5060); })) {
      logger.info(`discarding INVITE addressed to us: ${req.uri}`);
      return res.send(503);
    }
  }
  next();
});

srf.invite(callHandler);

// pass on registers or subscribes
['register', 'subscribe'].forEach((v) => {
  srf[v]((req, res) => {
    req.proxy();
  });
});


module.exports = srf;
