const test = require('tape').test ;
const exec = require('child_process').exec ;

test('stopping docker network..', (t) => {
  t.timeoutAfter(20000);
  exec(`docker-compose -f ${__dirname}/docker-compose-testbed.yaml down`, (err, stdout, stderr) => {
    //console.log(stdout);
    //console.log(stderr);
    t.end(err) ;
  });
});

