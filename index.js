const util = require('util');
const path = require('path');
const fs = require('fs');
const yaml = require('./zigbee/node_modules/js-yaml');

const Scanner = require('./lib/scanner');

let isFirst = true;
let plugin;
let controller;
let scanner;
let devices = {};

const defsettings = {
  homeassistant: false,
  permit_join: false,
  frontend: { enabled: false, port: 8080 },
  mqtt: { base_topic: 'zigbee2mqtt', server: 'mqtt://localhost' },
  serial: { port: '/dev/tty.usbserial-0001', adapter: 'zstack' },
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
  let settings
  const filePath = path.join(__dirname, 'zigbee', 'data', 'configuration.yaml');

  if (fs.existsSync(filePath)) {
    settings = yaml.load(fs.readFileSync(filePath, 'utf8'));
  } else {
    settings = defsettings;
    try {
      fs.mkdirSync(path.join(__dirname, 'zigbee', 'data'));
    } catch(e) {

    }
  }

  if (settings.serial === undefined) {
    settings.serial = {}
  }

  settings.serial.adapter = params.adapter || 'zstack'

  if (params.useManualPort) {
    settings.serial.port = params.manualPort || ''
  } else {
    settings.serial.port = params.port || '/dev/tty.usbserial-0001'
  }

  if (settings.frontend === undefined) settings.frontend = {}
  
  if (params.useHttp) {
    settings.frontend.enabled = true
    settings.frontend.port = params.httpPort || 8080
  } else {
     settings.frontend.enabled = false
  }

  plugin.log(`serial port: ${settings.serial.port}`);
  
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

function getOptFromArgs() {
  let opt;
  try {
    opt = JSON.parse(process.argv[2]);
  } catch (e) {
    opt = {};
  }
  return opt;
}

function mqttPublish(topic, payload, options) {
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

          if (scanner.status > 0) {
            for (const id in devices[item.ieee_address].props) {
              const key = devices[item.ieee_address].props[id].property
              scanner.process(devices[item.ieee_address], key, '');
            }
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
        if (msg.type === 'device_interview' && msg.data.status === 'started') {
          plugin.log(` Starting interview of  '${msg.data.friendly_name}'`)

          if (scanner.status > 0) {
            const id = msg.data.ieee_address
            let title = msg.data.ieee_address + ' - pairing...'

            if (devices[msg.data.ieee_address] && devices[msg.data.ieee_address].model_id) {
              title = devices[msg.data.ieee_address].model_id
            }
            
            scanner.process({ id, title }, null, null, true);
          }
        }
      }
    }
  } catch (e) {
    plugin.log(e);
  }
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
      controller && controller.zigbee && controller.zigbee.permitJoin(0);
      scanner.stop();
    } else if (scanObj.uuid) {
      controller && controller.zigbee && controller.zigbee.permitJoin(255);
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

  const MqttMock = require('./lib/mqtt-mock')
  const mqttPath = path.resolve(__dirname, './zigbee/dist/mqtt.js')
  
  require.cache[mqttPath] = {
    id: mqttPath,
    filename: mqttPath,
    loaded: true,
    exports: MqttMock,
  }

  const { Controller } = require('./zigbee/dist/controller');
  
  controller = new Controller(restart, exit);
  controller.mqtt.setHooks(mqttPublish)
  
  try {
    plugin.log('starting zigbee-herdsman...');
    await controller.start(); 
  } catch (e) {
    plugin.log(e.message);
  }
}

main();

