let isFirst = true;
let controller;
let scanner = {};
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
    console.log('zigbee-herdsman exit (stop)');
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
    console.log(topic)
    try {
      const msg = JSON.parse(payload);

      if (this.type === 'main') {
        Object.keys(msg).forEach(key => {
          console.log([{ id: topic + '_' + key, value: msg[key] }]);
          if (scanner.status > 0) {
            if (devices[topic]) {
              scanner.process(devices[topic], key, msg[key]);
            } else {
              console.log('Not found device ' + topic + ' devices=' + util.inspect(devices));
            }
          }
        });
      } else {
        if (topic === 'bridge/devices') {
          if (isFirst) {
            isFirst = false;
            console.log('zigbee-herdsman started (resumed)');
          }
          msg.forEach(item => {
            devices[item.ieee_address] = {
              id: item.ieee_address,
              title: item.model_id,
              ieee_address: item.ieee_address,
              manufacturer: item.manufacturer,
              model_id: item.model_id,
              supported: item.supported,
              props: {},
            };
            if (item.definition && item.definition.exposes) {
              item.definition.exposes.forEach(prop => {
                if (prop.features) {
                  prop.features.forEach(prop2 => {
                    devices[item.ieee_address].props[prop2.property] = prop2;
                  });
                } else {
                  devices[item.ieee_address].props[prop.property] = prop;
                }
              })
            }
            console.log(devices[item.ieee_address]);
          });
        }
        if (topic === 'bridge/event') {
          if (msg.type === 'device_leave') {
            console.log(` Device '${msg.data.friendly_name}' left the network`)
          }
          if (msg.type === 'device_joined') {
            console.log(` Device '${msg.data.friendly_name}' joined`)
          }
          if (msg.type === 'device_interview') {
            console.log(` Starting interview of  '${msg.data.friendly_name}'`)
          }
        }
      }
    } catch (e) {
      console.log(e);
    }

    if (topic !== 'bridge/logging') {
      this.eventBus.emitMQTTMessagePublished({
        topic: 'zigbee2mqtt/' + topic,
        payload,
        options: { ...{ qos: 0, retain: false }, ...options }
      });

      this.onMessage(topic, payload);
    }
    return Promise.resolve();
  }

  onMessage(topic, message) {
    this.eventBus.emitMQTTMessage({ topic, message: message });
  }
}

async function main () {

  const Controller = require('./zigbee/dist/controller');
  controller = new Controller(restart, exit);
  controller.mqtt = new MQTT('main', controller.mqtt.eventBus);

  controller.extensions.forEach(i => {
    if (i.mqtt !== undefined) {
      i.mqtt = new MQTT('service', i.mqtt.eventBus);
    }
  });

  await controller.start();
}

main();