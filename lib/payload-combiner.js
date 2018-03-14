const uuidv4 = require('uuid/v4');
const moment = require('moment');
const parseUri = require('drachtio-srf').parseUri;

module.exports = function(opts, boundary) {
  const arr1 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(opts.epSiprecCaller.local.sdp) ;
  const arr2 = /^([^]+)(c=[^]+)t=[^]+(m=[^]+?)(a=[^]+)$/.exec(opts.epSiprecCallee.local.sdp) ;

  const sdp = `${arr1[1]}t=0 0\r\n${arr1[2]}${arr1[3]}${arr1[4]}${arr2[3]}${arr2[4]}`
    .replace(/a=sendrecv\r\n/g, 'a=sendonly\r\n');

  const sessionId = uuidv4();
  const now = moment().format();
  const to = opts.req.getParsedHeader('To');
  const toUri = parseUri(to.uri);
  const from = opts.req.getParsedHeader('From');
  const fromUri = parseUri(from.uri);
  opts.logger.info(`from: ${JSON.stringify(fromUri)}`);
  opts.logger.info(`to: ${JSON.stringify(toUri)}`);
  const aorCaller = `sip:${fromUri.user ? fromUri.user + '@' : ''}${fromUri.host}`;
  const aorCallee = `sip:${toUri.user ? toUri.user + '@' : ''}${toUri.host}`;
  const payload =
`${boundary}
Content-Type: application/sdp

${sdp}
${boundary}
Content-Disposition: recording-session
Content-Type: application/rs-metadata+xml

<?xml version="1.0" encoding="UTF-8"?>
<recording xmlns="urn:ietf:params:xml:ns:recording:1">
  <datamode>complete</datamode>
  <session session_id="${sessionId}">
    <sipSessionID>${opts.req.get('Call-ID')}</sipSessionID>
    <start-time>${now}</start-time>
  </session>
  <participant participant_id="kQNhKFdEEeeJ99D/VsPGWA==">
    <nameID aor="${aorCaller}">
      <name>${from.name}</name>
    </nameID>
  </participant>
  <participantsessionassoc participant_id="kQNhKFdEEeeJ99D/VsPGWA==" session_id="${sessionId}">
    <associate-time>${now}</associate-time>
  </participantsessionassoc>
  <stream stream_id="kQOH5VdEEeeJ/ND/VsPGWA==" session_id="kQNhKFdEEeeJ9tD/VsPGWA==">
    <label>1</label>
  </stream>
  <participant participant_id="kQNhKFdEEeeJ+ND/VsPGWA==">
    <nameID aor="${aorCallee}">
      <name>${to.name}</name>
    </nameID>
  </participant>
  <participantsessionassoc participant_id="kQNhKFdEEeeJ+ND/VsPGWA==" session_id="${sessionId}">
    <associate-time>${now}</associate-time>
  </participantsessionassoc>
  <stream stream_id="kQOH5VdEEeeJ/dD/VsPGWA==" session_id="${sessionId}">
    <label>2</label>
  </stream>
  <participantstreamassoc participant_id="kQNhKFdEEeeJ99D/VsPGWA==">
    <send>kQOH5VdEEeeJ/ND/VsPGWA==</send>
    <recv>kQOH5VdEEeeJ/dD/VsPGWA==</recv>
  </participantstreamassoc>
  <participantstreamassoc participant_id="kQNhKFdEEeeJ+ND/VsPGWA==">
    <send>kQOH5VdEEeeJ/dD/VsPGWA==</send>
    <recv>kQOH5VdEEeeJ/ND/VsPGWA==</recv>
  </participantstreamassoc>
</recording>
${boundary}--`;

  return payload.replace(/\n/g, '\r\n');
};

