# drachtio-siprec-recording-client [![Build Status](https://secure.travis-ci.org/davehorton/drachtio-siprec-recording-client.png)](http://travis-ci.org/davehorton/drachtio-siprec-recording-client)

A SIPREC recording client based on [dractio](https://github.com/davehorton/drachtio-srf) and [Freeswitch](https://freeswitch.org/).  This application expects to receive INVITEs with a non-local Request URI and will connect the caller to that uri while generating a SIPREC INVITE to the configured siprec server.  In other words, it acts like an sip outbound proxy with siprec client functionality.

## Install

* Copy `config/default.json.example` to `config/local.json` and edit to provide the IP addresses/ports for your configuration (i.e., location of drachtio server, freeswitch server, and the SIPREC recording server). 
* Run `npm install`
* Run `node app` to run.

## Test

`npm test` note: docker is required

## How it works

The application receives an incoming INVITE and first checks to verify that the Request URI refers to a remote server; if not, the INVITE is rejected.  

Once the INVITE has been validated, the application creates a conference on Freeswitch and adds 4 endpoints to the conference; one for the incoming caller, one for the outgoing call to the specified destination, and two to stream to the remote SIPREC recording server.  

The latter two endpoints are then configured to receive only the caller or callee audio stream rather than the conference mix -- that is, for SIPREC we want to send one stream with only the caller audio, and a second stream with only the callee audio.




