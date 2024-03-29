const util = require('util');
const path = require('path');
const fs = require('fs');
const yaml = require('./zigbee/node_modules/js-yaml');

// const plugin = require('ih-plugin-api')();
const Scanner = require('./lib/scanner');

let isFirst = true;
let plugin;
let controller;
let scanner;
let devices = {};

const defsettings = {
  homeassistant: false,
  permit_join: false,
  mqtt: { base_topic: 'zigbee2mqtt', server: 'mqtt://localhost' },
  serial: { port: '/dev/tty.usbserial-0001' },
  advanced: {
    log_output: [ 'console' ],
    cache_state: false,
    cache_state_persistent: false,
    cache_state_send_on_startup: false,
    homeassistant_legacy_entity_attributes: false,
    legacy_api: false
  },
  device_options: { legacy: false }
};


function createSettings(params) {
  plugin.log(`serial port: ${params.port}`);
  
  let settings
  const filePath = path.join(__dirname, 'zigbee', 'data', 'configuration.yaml');

  if (fs.existsSync(filePath)) {
    settings = yaml.load(fs.readFileSync(filePath, 'utf8'));
  } else {
    settings = defsettings;
    fs.mkdirSync(path.join(__dirname, 'zigbee', 'data'));
  }

  if (settings.serial === undefined) {
    settings.serial = {};
  }

  settings.serial.port = params.port || '/dev/tty.usbserial-0001';
  

  fs.writeFileSync(filePath, yaml.dump(settings), 'utf8');
  return Promise.resolve();
}

async function stop(reason = null) {
  await controller.stop(reason);
}

async function restart() {
  await stop('indexjs.restart');
  await start();
}

async function exit(code, reason) {
  if (reason !== 'indexjs.restart') {
    plugin.log('zigbee-herdsman exit (stop)');
    process.exit(0);
  }
}

function getValue(id, propid, value) {
  if (controller && controller.mqtt && devices[id] && devices[id].props && devices[id].props[propid]) {
    if (devices[id].props[propid].type === 'binary') {
      const values = {
        [devices[id].props[propid].value_on]: 1,
        [devices[id].props[propid].value_off]: 0
      }
      return values[value] !== undefined ? values[value] : value;
    }
  }
  return value;
}

class MQTT {
  constructor(type, eventBus) {
    this.type = type;
    this.eventBus = eventBus;
  }

  connect() {
    //this.publish('bridge/state', 'online', { retain: true, qos: 0 });
    return new Promise(resolve => resolve());
  }

  disconnect() {
    process.exit(0);
  }

  publish(topic, payload, options) {
    try {
      const msg = JSON.parse(payload);
      if (devices[topic]) {
        Object.keys(msg).forEach(key => {
          plugin.sendData([{ id: topic + '_' + key, value: getValue(topic, key, msg[key]) }]);
          if (scanner.status > 0) {
            if (devices[topic]) {
              scanner.process(devices[topic], key, getValue(topic, key, msg[key]));
            } else {
              plugin.log('Not found device ' + topic + ' devices=' + util.inspect(devices));
            }
          }
        });
      } else {
        if (topic === 'bridge/devices') {
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
          });
          if (isFirst) {
            isFirst = false;
            const list = [];

            Object
              .keys(devices)
              .forEach(key => {
                Object
                .keys(devices[key].props)
                .forEach(propid => {
                    list.push({ id: key + '_' + propid });
                });
              });

            plugin.send({ type: 'syncChannels', data: list });
            plugin.log('zigbee-herdsman started (resumed)');
          }
        }
        if (topic === 'bridge/event') {
          if (msg.type === 'device_leave') {
            const key = msg.data.ieee_address;
            const list = [];
            if (devices[key]) {
              Object
              .keys(devices[msg.data.ieee_address].props)
              .forEach(propid => {
                list.push({ id: key + '_' + propid });
              });
            }
            plugin.send({ type: 'removeChannels', data: list });
            plugin.log(` Device '${msg.data.friendly_name}' left the network`)
          }
          if (msg.type === 'device_joined') {
            plugin.log(` Device '${msg.data.friendly_name}' joined`)
          }
          if (msg.type === 'device_interview') {
            plugin.log(` Starting interview of  '${msg.data.friendly_name}'`)
          }
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
    }
    return Promise.resolve();
  }

  onMessage(topic, message) {
    this.eventBus.emitMQTTMessage({ topic, message: message });
  }
}


function getOptFromArgs() {
  let opt;
  try {
    opt = JSON.parse(process.argv[2]); //
  } catch (e) {
    opt = {};
  }
  return opt;
}

async function main() {
  
  const opt = getOptFromArgs();
  const pluginapi = opt && opt.pluginapi ? opt.pluginapi : 'ih-plugin-api';
  plugin = require(pluginapi+'/index.js')();
 
  plugin.params.data = await plugin.params.get();

  scanner = new Scanner(plugin);

  plugin.onScan(scanObj => {
    if (!scanObj) return;
    if (scanObj.stop) {
      controller && controller.zigbee && controller.zigbee.permitJoin(false);
      scanner.stop();
    } else if (scanObj.uuid) {
      controller && controller.zigbee && controller.zigbee.permitJoin(true);
      scanner.request(scanObj);
    }
  });

  plugin.onAct(message => {
    if (!message.data) return;
    message.data.forEach(item => {
      try {
        plugin.log('PUBLISH command ' + util.inspect(item), 1);

        const temp = item.id.split('_');
        const id = temp[0];
        const propid = temp.slice(1).join('_');

        if (controller && controller.mqtt && devices[id] && devices[id].props && devices[id].props[propid]) {
          if (devices[id].props[propid].access === 2 || devices[id].props[propid].access === 7) {
            if (devices[id].props[propid].type === 'binary') {
              controller.mqtt.onMessage( 
                `zigbee2mqtt/${id}/set`, 
                JSON.stringify({ [propid]: item.value ? devices[id].props[propid].value_on : devices[id].props[propid].value_off }) 
              );
          
            } else {
              controller.mqtt.onMessage( 
                `zigbee2mqtt/${id}/set`, 
                JSON.stringify({ [propid]: item.value }) 
              );
            }
          }
        }
      } catch (e) {
        const errStr = 'ERROR Act: ' + util.inspect(e) + ' /n message.data item: ' + util.inspect(item);
        plugin.log(errStr);
      }
    });
  });

  plugin.onChange('params', data => {
    process.exit(0);
  });

  await createSettings(plugin.params.data);

  const Controller = require('./zigbee/dist/controller');
  controller = new Controller(restart, exit);
  controller.mqtt = new MQTT('main', controller.mqtt.eventBus);

  controller.extensions.forEach(i => {
    if (i.mqtt !== undefined) {
      i.mqtt = new MQTT('service', i.mqtt.eventBus);
    }
  });

  plugin.log('starting zigbee-herdsman...');

  await controller.start();
}

main();

