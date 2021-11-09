const util = require('util');

const plugin = require('ih-plugin-api')();
const Scanner = require('./lib/scanner');

let controller;
let scanner;
let devices = {};

async function stop(reason = null) {
  await controller.stop(reason);
}

async function restart() {
  await stop('indexjs.restart');
  await start();
}

async function exit(code, reason) {
  if (reason !== 'indexjs.restart') {
    process.exit(0);
  }
}

class MQTT {
  constructor(type, eventBus) {
    this.type = type;
    this.eventBus = eventBus;
  }

  connect() {
    this.publish('bridge/state', 'online', { retain: true, qos: 0 });
    return new Promise(resolve => resolve());
  }

  disconnect() {
    process.exit(0);
  }

  publish(topic, payload, options) {
    try {
      const msg = JSON.parse(payload);

      if (this.type === 'main') {
        Object.keys(msg).forEach(key => {
          console.log('zigbee/' + topic + '/' + key + ' ' + msg[key]);
          plugin.sendData([{ id: topic + '_' + key, value: msg[key] }]);
          if (scanner.status > 0) {
            if (devices[topic]) {
              scanner.process(devices[topic], key, msg[key]);
            } else {
              plugin.log('Not found device ' + topic + ' devices=' + util.inspect(devices));
            }
          }
        });
      } else {
        if (topic === 'bridge/devices') {
          msg.forEach(item => {
            if (true) {
              const device = {
                id: item.ieee_address,
                title: item.model_id,
                ieee_address: item.ieee_address,
                manufacturer: item.manufacturer,
                model_id: item.model_id,
                supported: item.supported
              };
              devices[device.ieee_address] = device;
            }
          });
        }

        if (topic === 'bridge/event' && msg.type !== undefined) {
          plugin.log(msg.type);
        }
      }
    } catch (e) {
      plugin.log(e);
    }

    if (topic !== 'bridge/logging') {
      this.eventBus.emitMQTTMessagePublished({
        topic: 'zigbee2mqtt/' + topic,
        payload,
        options: { ...{ qos: 0, retain: false }, ...options }
      });

      this.onMessage(topic, payload);
    } else {
      plugin.log(payload);
    }

    return Promise.resolve();
  }

  onMessage(topic, message) {
    this.eventBus.emitMQTTMessage({ topic, message: message });
  }
}

async function main() {
  plugin.params.data = await plugin.params.get();
  plugin.log('Received params ' + JSON.stringify(plugin.params.data));

  scanner = new Scanner(plugin);
  plugin.onScan(scanObj => {
    if (!scanObj) return;
    if (scanObj.stop) {
      scanner.stop();
    } else if (scanObj.uuid) {
      scanner.request(scanObj);
    }
  });

  plugin.onAct(message => {
    if (!message.data) return;
    message.data.forEach(item => {
      try {
        // item =  {id: '0x00158d00054ab741_ON', value: 1, command:'set'}
        // TODO  сформировать команду
        plugin.log('PUBLISH command ' + util.inspect(item), 1);
      } catch (e) {
        const errStr = 'ERROR Act: ' + util.inspect(e) + ' /n message.data item: ' + util.inspect(item);
        plugin.log(errStr);
      }
    });
  });

    // if (plugin.params.serialport) {
    const Controller = require('./zigbee/dist/controller');
    controller = new Controller(restart, exit);
    controller.mqtt = new MQTT('main', controller.mqtt.eventBus);

    controller.extensions.forEach(i => {
      if (i.mqtt !== undefined) {
        i.mqtt = new MQTT('service', i.mqtt.eventBus);
      }
    });
    await controller.start();

    /*
    } else {
      plugin.log('RUN in MOCK mode without zigbee controller!');
      const MockController = require('./lib/mock');
      controller = new MockController(plugin);
      controller.mqtt = new MQTT('main', controller.eventBus);
      devices = controller.getDevices();
     controller.startPublish(20); // Генерировать сообщения с интервалом 2 сек
    }
    */
  
}

main();
