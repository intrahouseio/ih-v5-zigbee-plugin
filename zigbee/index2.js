const indexJsRestart = 'indexjs.restart';

let controller;
let stopping = false;


async function stop(reason=null) {
  await controller.stop(reason);
}

async function restart() {
  await stop(indexJsRestart);
  await start();
}

async function exit(code, reason) {
  if (reason !== indexJsRestart) {
      process.exit(code);
  }
}

async function main () {
  const Controller = require('./dist/controller');
  controller = new Controller(restart, exit);
  await controller.start();
}


main();