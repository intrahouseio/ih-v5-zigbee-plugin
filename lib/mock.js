/**
 * mock.js
 * Заглушка для запуска без zigbee контроллера
 *  для проверки механизма сканирования
 */

const util = require('util');

const deviceArr = [
  {
    id: '0x00158d00016c3dea',
    type: 'EndDevice',
    ieee_address: '0x00158d00016c3dea',
    nwkAddr: 31218,
    manufacturer: 'LUMI',
    model_id: 'lumi.sensor_magnet.aq2',
    title: 'lumi.sensor_magnet.aq2',
    props:['bin_contact', 'linkq'],
    values:{}
  },
  {
    id:'0x00158d0001fa8897',
    type: 'EndDevice',
    ieee_address: '0x00158d0001fa8897',
    nwkAddr: 38117,
    manufId: 4151,
    manufacturer: 'LUMI',
    powerSource: 'Battery',
    model_id: 'lumi.weather',
    title: 'lumi.weather',
    props:['temperature', 'humidity', 'linkq'],
    values:{}
  },
  {
    id: '0x00158d0001db7e50',
    type: 'EndDevice',
    ieee_address: '0x00158d0001db7e50',
    nwkAddr: 8596,
    manufacturer: 'LUMI',
    model_id: 'lumi.sensor_smoke',
    title: 'lumi.sensor_smoke',
    props:['bin_smoke', 'linkq'],
    values:{}
  },
  {
    id:'0x00158d00054ab741',
    type: 'EndDevice',
    ieee_address: '0x00158d00054ab741',
    nwkAddr: 43212,
    manufacturer: 'LUMI',
    model_id: 'lumi.switch.b2lacn02',
    title: 'lumi.switch.b2lacn02',
    props:['ON', 'linkq'],
    values:{}
  }
];

let currentIdx = 0;

class MockController {
  constructor(logger) {
    this.logger = logger;
    this.eventBus = {
      emitMQTTMessage: () => {},
      emitMQTTMessagePublished: () => {}
    };
  }

  startPublish(sec) {
    setInterval(() => {
      const {id, msg} = next();
      this.mqtt.publish(id, JSON.stringify(msg));
    }, sec * 1000);
  }

  getDevices() {
    const res = {};
    deviceArr.forEach(dev => {
      const {props, values, ...desc} = dev;
      res[dev.id] = desc;
    });
    return res;
  }
}


function next() {
  currentIdx =  (currentIdx >= deviceArr.length-1) ? 0 : currentIdx+1;
  const dev = deviceArr[currentIdx];
  const res = {id: dev.id, msg:{}}
  dev.props.forEach(prop => {
    dev.values[prop] = getNextValue(dev.values[prop], prop);
    res.msg[prop] = dev.values[prop];
  })
  return res;
}

function getNextValue(prev, prop) {
  if (prev == undefined) return 0;
  if (prop == 'ON' || prop.startsWith('bin_')) {
    return prev ? 0 : 1;
  }
  return prev >=100 ? 1 : prev+1; 
}

module.exports = MockController;
