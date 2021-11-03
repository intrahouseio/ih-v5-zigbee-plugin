const plugin = require('ih-plugin-api')();

let controller;

async function stop(reason=null) {
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
    this.eventBus = eventBus
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
        Object
          .keys(msg)
          .forEach(key => {
            plugin.log('zigbee/' + topic + '/' + key + ' ' + msg[key])
            console.log('zigbee/' + topic + '/' + key + ' ' + msg[key]);
          })
      } else {
        if (topic === 'bridge/devices') {
          msg.forEach(item => {
            if (true) {
              const device = {
                ieee_address: item.ieee_address,
                manufacturer: item.manufacturer,
                model_id: item.model_id,
                supported: item.supported,
  
                description: item.definition.description,
                model: item.definition.model,
                vendor: item.definition.vendor,
                props: item.definition.exposes,
              }
              console.log(device.description)
            }
          })
        }

        if (topic === 'bridge/event' && msg.type !== undefined) {
          plugin.log(msg.type)
        }
      }    
    } catch {

    }
    
    if (topic !== 'bridge/logging') {
      this.eventBus.emitMQTTMessagePublished({
        topic: 'zigbee2mqtt/' + topic, 
        payload, 
        options: {...{qos: 0, retain: false}, ...options}
      });
  
      this.onMessage(topic, payload)
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
  const Controller = require('./zigbee/dist/controller');
  controller = new Controller(restart, exit);

  controller.mqtt = new MQTT('main', controller.mqtt.eventBus);

  controller.extensions.forEach(i => {
    if (i.mqtt !== undefined) {
      i.mqtt = new MQTT('service', i.mqtt.eventBus);
    }
  })

  await controller.start();



}

main();

