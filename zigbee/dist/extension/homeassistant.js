"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const settings = __importStar(require("../util/settings"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const assert_1 = __importDefault(require("assert"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const sensorClick = {
    type: 'sensor',
    object_id: 'click',
    mockProperties: [{ property: 'click', value: null }],
    discovery_payload: {
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};
const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;
const groupSupportedTypes = ['light', 'switch', 'lock', 'cover'];
const defaultStatusTopic = 'homeassistant/status';
const legacyMapping = [
    {
        models: ['WXKG01LM', 'HS1EB/HS1EB-E', 'ICZB-KPD14S', 'TERNCY-SD01', 'TERNCY-PP01', 'ICZB-KPD18S',
            'E1766', 'ZWallRemote0', 'ptvo.switch', '2AJZ4KPKEY', 'ZGRC-KEY-013', 'HGZB-02S', 'HGZB-045',
            'HGZB-1S', 'AV2010/34', 'IM6001-BTP01', 'WXKG11LM', 'WXKG03LM', 'WXKG02LM_rev1', 'WXKG02LM_rev2',
            'QBKG04LM', 'QBKG03LM', 'QBKG11LM', 'QBKG21LM', 'QBKG22LM', 'WXKG12LM', 'QBKG12LM',
            'E1743'],
        discovery: sensorClick,
    },
    {
        models: ['ICTC-G-1'],
        discovery: {
            type: 'sensor',
            mockProperties: [{ property: 'brightness', value: null }],
            object_id: 'brightness',
            discovery_payload: {
                unit_of_measurement: 'brightness',
                icon: 'mdi:brightness-5',
                value_template: '{{ value_json.brightness }}',
            },
        },
    },
];
const featurePropertyWithoutEndpoint = (feature) => {
    if (feature.endpoint) {
        return feature.property.slice(0, -1 + -1 * feature.endpoint.length);
    }
    else {
        return feature.property;
    }
};
/**
 * This extensions handles integration with HomeAssistant
 */
class HomeAssistant extends extension_1.default {
    constructor(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension) {
        super(zigbee, mqtt, state, publishEntityState, eventBus, enableDisableExtension, restartCallback, addExtension);
        this.discovered = {};
        this.discoveredTriggers = {};
        this.discoveryTopic = settings.get().homeassistant.discovery_topic;
        this.statusTopic = settings.get().homeassistant.status_topic;
        this.entityAttributes = settings.get().homeassistant.legacy_entity_attributes;
        if (settings.get().advanced.output === 'attribute') {
            throw new Error('Home Assistant integration is not possible with attribute output!');
        }
    }
    async start() {
        if (!settings.get().advanced.cache_state) {
            logger_1.default.warn('In order for Home Assistant integration to work properly set `cache_state: true');
        }
        this.zigbee2MQTTVersion = (await utils_1.default.getZigbee2MQTTVersion(false)).version;
        this.eventBus.onDeviceRemoved(this, this.onDeviceRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onEntityRenamed(this, this.onEntityRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        this.eventBus.onEntityOptionsChanged(this, (data) => this.discover(data.entity, true));
        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(defaultStatusTopic);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);
        // MQTT discovery of all paired devices on startup.
        for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
            this.discover(entity, true);
        }
        // Send availability messages, this is required if the legacy_availability_payload option has been changed.
        this.eventBus.emitPublishAvailability();
    }
    exposeToConfig(exposes, entityType, allExposes, definition) {
        var _a, _b, _c, _d, _e;
        // For groups an array of exposes (of the same type) is passed, this is to determine e.g. what features
        // to use for a bulb (e.g. color_xy/color_temp)
        (0, assert_1.default)(entityType === 'group' || exposes.length === 1, 'Multiple exposes for device not allowed');
        const firstExpose = exposes[0];
        (0, assert_1.default)(entityType === 'device' || groupSupportedTypes.includes(firstExpose.type), `Unsupported expose type ${firstExpose.type} for group`);
        const discoveryEntries = [];
        const endpoint = entityType === 'device' ? exposes[0].endpoint : undefined;
        const getProperty = (feature) => entityType === 'group' ?
            featurePropertyWithoutEndpoint(feature) : feature.property;
        /* istanbul ignore else */
        if (firstExpose.type === 'light') {
            const hasColorXY = exposes.find((expose) => expose.features.find((e) => e.name === 'color_xy'));
            const hasColorHS = exposes.find((expose) => expose.features.find((e) => e.name === 'color_hs'));
            const hasBrightness = exposes.find((expose) => expose.features.find((e) => e.name === 'brightness'));
            const hasColorTemp = exposes.find((expose) => expose.features.find((e) => e.name === 'color_temp'));
            const state = firstExpose.features.find((f) => f.name === 'state');
            // Prefer HS over XY when at least one of the lights in the group prefers HS over XY.
            // A light prefers HS over XY when HS is earlier in the feature array than HS.
            const preferHS = exposes.map((e) => [e.features.findIndex((ee) => ee.name === 'color_xy'),
                e.features.findIndex((ee) => ee.name === 'color_hs')])
                .filter((d) => d[0] !== -1 && d[1] !== -1 && d[1] < d[0]).length !== 0;
            const discoveryEntry = {
                type: 'light',
                object_id: endpoint ? `light_${endpoint}` : 'light',
                mockProperties: [{ property: state.property, value: null }],
                discovery_payload: {
                    brightness: !!hasBrightness,
                    schema: 'json',
                    command_topic: true,
                    brightness_scale: 254,
                    command_topic_prefix: endpoint,
                    state_topic_postfix: endpoint,
                },
            };
            const colorModes = [
                hasColorXY && !preferHS ? 'xy' : null,
                (!hasColorXY || preferHS) && hasColorHS ? 'hs' : null,
                hasColorTemp ? 'color_temp' : null,
            ].filter((c) => c);
            if (colorModes.length) {
                discoveryEntry.discovery_payload.color_mode = true;
                discoveryEntry.discovery_payload.supported_color_modes = colorModes;
            }
            if (hasColorTemp) {
                const colorTemps = exposes.map((expose) => expose.features.find((e) => e.name === 'color_temp'))
                    .filter((e) => e);
                const max = Math.min(...colorTemps.map((e) => e.value_max));
                const min = Math.max(...colorTemps.map((e) => e.value_min));
                discoveryEntry.discovery_payload.max_mireds = max;
                discoveryEntry.discovery_payload.min_mireds = min;
            }
            const effects = utils_1.default.arrayUnique(utils_1.default.flatten(allExposes.filter((e) => e.type === 'enum' && e.name === 'effect').map((e) => e.values)));
            if (effects.length) {
                discoveryEntry.discovery_payload.effect = true;
                discoveryEntry.discovery_payload.effect_list = effects;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'switch') {
            const state = firstExpose.features.find((f) => f.name === 'state');
            const property = getProperty(state);
            const discoveryEntry = {
                type: 'switch',
                object_id: endpoint ? `switch_${endpoint}` : 'switch',
                mockProperties: [{ property: property, value: null }],
                discovery_payload: {
                    payload_off: state.value_off,
                    payload_on: state.value_on,
                    value_template: `{{ value_json.${property} }}`,
                    command_topic: true,
                    command_topic_prefix: endpoint,
                },
            };
            const different = ['valve_detection', 'window_detection', 'auto_lock', 'away_mode'];
            if (different.includes(property)) {
                discoveryEntry.discovery_payload.command_topic_postfix = property;
                discoveryEntry.discovery_payload.state_off = state.value_off;
                discoveryEntry.discovery_payload.state_on = state.value_on;
                discoveryEntry.object_id = property;
                if (property === 'window_detection') {
                    discoveryEntry.discovery_payload.icon = 'mdi:window-open-variant';
                }
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'climate') {
            const setpointProperties = ['occupied_heating_setpoint', 'current_heating_setpoint'];
            const setpoint = firstExpose.features.find((f) => setpointProperties.includes(f.name));
            (0, assert_1.default)(setpoint, 'No setpoint found');
            const temperature = firstExpose.features.find((f) => f.name === 'local_temperature');
            (0, assert_1.default)(temperature, 'No temperature found');
            const discoveryEntry = {
                type: 'climate',
                object_id: endpoint ? `climate_${endpoint}` : 'climate',
                mockProperties: [],
                discovery_payload: {
                    // Static
                    state_topic: false,
                    temperature_unit: 'C',
                    // Setpoint
                    temp_step: setpoint.value_step,
                    min_temp: setpoint.value_min.toString(),
                    max_temp: setpoint.value_max.toString(),
                    // Temperature
                    current_temperature_topic: true,
                    current_temperature_template: `{{ value_json.${temperature.property} }}`,
                    command_topic_prefix: endpoint,
                },
            };
            const mode = firstExpose.features.find((f) => f.name === 'system_mode');
            if (mode) {
                if (mode.values.includes('sleep')) {
                    // 'sleep' is not supported by Home Assistant, but is valid according to ZCL
                    // TRV that support sleep (e.g. Viessmann) will have it removed from here,
                    // this allows other expose consumers to still use it, e.g. the frontend.
                    mode.values.splice(mode.values.indexOf('sleep'), 1);
                }
                discoveryEntry.discovery_payload.mode_state_topic = true;
                discoveryEntry.discovery_payload.mode_state_template = `{{ value_json.${mode.property} }}`;
                discoveryEntry.discovery_payload.modes = mode.values;
                discoveryEntry.discovery_payload.mode_command_topic = true;
            }
            const state = firstExpose.features.find((f) => f.name === 'running_state');
            if (state) {
                discoveryEntry.mockProperties.push({ property: state.property, value: null });
                discoveryEntry.discovery_payload.action_topic = true;
                discoveryEntry.discovery_payload.action_template = `{% set values = ` +
                    `{None:None,'idle':'off','heat':'heating','cool':'cooling','fan_only':'fan'}` +
                    ` %}{{ values[value_json.${state.property}] }}`;
            }
            const coolingSetpoint = firstExpose.features.find((f) => f.name === 'occupied_cooling_setpoint');
            if (coolingSetpoint) {
                discoveryEntry.discovery_payload.temperature_low_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_low_state_template =
                    `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_low_state_topic = true;
                discoveryEntry.discovery_payload.temperature_high_command_topic = coolingSetpoint.name;
                discoveryEntry.discovery_payload.temperature_high_state_template =
                    `{{ value_json.${coolingSetpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_high_state_topic = true;
            }
            else {
                discoveryEntry.discovery_payload.temperature_command_topic = setpoint.name;
                discoveryEntry.discovery_payload.temperature_state_template =
                    `{{ value_json.${setpoint.property} }}`;
                discoveryEntry.discovery_payload.temperature_state_topic = true;
            }
            const fanMode = firstExpose.features.find((f) => f.name === 'fan_mode');
            if (fanMode) {
                discoveryEntry.discovery_payload.fan_modes = fanMode.values;
                discoveryEntry.discovery_payload.fan_mode_command_topic = true;
                discoveryEntry.discovery_payload.fan_mode_state_template =
                    `{{ value_json.${fanMode.property} }}`;
                discoveryEntry.discovery_payload.fan_mode_state_topic = true;
            }
            const swingMode = firstExpose.features.find((f) => f.name === 'swing_mode');
            if (swingMode) {
                discoveryEntry.discovery_payload.swing_modes = swingMode.values;
                discoveryEntry.discovery_payload.swing_mode_command_topic = true;
                discoveryEntry.discovery_payload.swing_mode_state_template =
                    `{{ value_json.${swingMode.property} }}`;
                discoveryEntry.discovery_payload.swing_mode_state_topic = true;
            }
            const preset = firstExpose.features.find((f) => f.name === 'preset');
            if (preset) {
                discoveryEntry.discovery_payload.preset_modes = preset.values;
                discoveryEntry.discovery_payload.preset_mode_command_topic = 'preset';
                discoveryEntry.discovery_payload.preset_mode_value_template =
                    `{{ value_json.${preset.property} }}`;
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
            }
            const tempCalibration = firstExpose.features.find((f) => f.name === 'local_temperature_calibration');
            if (tempCalibration) {
                const discoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${tempCalibration.name}_${endpoint}` : `${tempCalibration.name}`,
                    mockProperties: [{ property: tempCalibration.property, value: null }],
                    discovery_payload: {
                        value_template: `{{ value_json.${tempCalibration.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: tempCalibration.property,
                        device_class: 'temperature',
                        entity_category: 'config',
                        icon: 'mdi:math-compass',
                        ...(tempCalibration.unit && { unit_of_measurement: tempCalibration.unit }),
                    },
                };
                if (tempCalibration.value_min != null)
                    discoveryEntry.discovery_payload.min = tempCalibration.value_min;
                if (tempCalibration.value_max != null)
                    discoveryEntry.discovery_payload.max = tempCalibration.value_max;
                if (tempCalibration.value_step != null) {
                    discoveryEntry.discovery_payload.step = tempCalibration.value_step;
                }
                discoveryEntries.push(discoveryEntry);
            }
            const piHeatingDemand = firstExpose.features.find((f) => f.name === 'pi_heating_demand');
            if (piHeatingDemand) {
                const discoveryEntry = {
                    type: 'sensor',
                    object_id: endpoint ? `${piHeatingDemand.name}_${endpoint}` : `${piHeatingDemand.name}`,
                    mockProperties: [{ property: piHeatingDemand.property, value: null }],
                    discovery_payload: {
                        value_template: `{{ value_json.${piHeatingDemand.property} }}`,
                        ...(piHeatingDemand.unit && { unit_of_measurement: piHeatingDemand.unit }),
                        entity_category: 'diagnostic',
                        icon: 'mdi:radiator',
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'lock') {
            (0, assert_1.default)(!endpoint, `Endpoint not supported for lock type`);
            const state = firstExpose.features.find((f) => f.name === 'state');
            (0, assert_1.default)(state, 'No state found');
            const discoveryEntry = {
                type: 'lock',
                object_id: 'lock',
                mockProperties: [{ property: state.property, value: null }],
                discovery_payload: {
                    command_topic: true,
                    value_template: `{{ value_json.${state.property} }}`,
                },
            };
            if (state.property === 'keypad_lockout') {
                // deprecated: keypad_lockout is messy, but changing is breaking
                discoveryEntry.discovery_payload.payload_lock = state.value_on;
                discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                discoveryEntry.discovery_payload.state_topic = true;
                discoveryEntry.object_id = 'keypad_lock';
            }
            else if (state.property === 'child_lock') {
                // deprecated: child_lock is messy, but changing is breaking
                discoveryEntry.discovery_payload.payload_lock = state.value_on;
                discoveryEntry.discovery_payload.payload_unlock = state.value_off;
                discoveryEntry.discovery_payload.state_locked = 'LOCK';
                discoveryEntry.discovery_payload.state_unlocked = 'UNLOCK';
                discoveryEntry.discovery_payload.state_topic = true;
                discoveryEntry.object_id = 'child_lock';
            }
            else {
                discoveryEntry.discovery_payload.state_locked = state.value_on;
                discoveryEntry.discovery_payload.state_unlocked = state.value_off;
            }
            if (state.property !== 'state') {
                discoveryEntry.discovery_payload.command_topic_postfix = state.property;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'cover') {
            const state = (_a = exposes.find((expose) => expose.features.find((e) => e.name === 'state'))) === null || _a === void 0 ? void 0 : _a.features.find((f) => f.name === 'state');
            const position = (_b = exposes.find((expose) => expose.features.find((e) => e.name === 'position'))) === null || _b === void 0 ? void 0 : _b.features.find((f) => f.name === 'position');
            const tilt = (_c = exposes.find((expose) => expose.features.find((e) => e.name === 'tilt'))) === null || _c === void 0 ? void 0 : _c.features.find((f) => f.name === 'tilt');
            const motorState = allExposes === null || allExposes === void 0 ? void 0 : allExposes.find((e) => e.type === 'enum' &&
                ['motor_state', 'moving'].includes(e.name) && e.access === ACCESS_STATE);
            const running = allExposes === null || allExposes === void 0 ? void 0 : allExposes.find((e) => e.type === 'binary' && e.name === 'running');
            const discoveryEntry = {
                type: 'cover',
                mockProperties: [{ property: state.property, value: null }],
                object_id: endpoint ? `cover_${endpoint}` : 'cover',
                discovery_payload: {
                    command_topic_prefix: endpoint,
                    command_topic: true,
                    state_topic: true,
                    state_topic_postfix: endpoint,
                },
            };
            // If curtains have `running` property, use this in discovery.
            // The movement direction is calculated (assumed) in this case.
            if (running) {
                discoveryEntry.discovery_payload.value_template = `{% if "${running.property}" in value_json ` +
                    `and value_json.${running.property} %} {% if value_json.${position.property} > 0 %} closing ` +
                    `{% else %} opening {% endif %} {% else %} stopped {% endif %}`;
            }
            // If curtains have `motor_state` or `moving` property, lookup for possible
            // state names to detect movement direction and use this in discovery.
            if (motorState) {
                const openingLookup = ['opening', 'open', 'forward', 'up', 'rising'];
                const closingLookup = ['closing', 'close', 'backward', 'back', 'reverse', 'down', 'declining'];
                const stoppedLookup = ['stopped', 'stop', 'pause', 'paused'];
                const openingState = motorState.values.find((s) => openingLookup.includes(s.toLowerCase()));
                const closingState = motorState.values.find((s) => closingLookup.includes(s.toLowerCase()));
                const stoppedState = motorState.values.find((s) => stoppedLookup.includes(s.toLowerCase()));
                if (openingState && closingState && stoppedState) {
                    discoveryEntry.discovery_payload.state_opening = openingState;
                    discoveryEntry.discovery_payload.state_closing = closingState;
                    discoveryEntry.discovery_payload.state_stopped = stoppedState;
                    discoveryEntry.discovery_payload.value_template = `{% if "${motorState.property}" in value_json ` +
                        `and value_json.${motorState.property} %} {{ value_json.${motorState.property} }} {% else %} ` +
                        `${stoppedState} {% endif %}`;
                }
            }
            // If curtains do not have `running`, `motor_state` or `moving` properties.
            if (!discoveryEntry.discovery_payload.value_template) {
                discoveryEntry.discovery_payload.value_template =
                    `{{ value_json.${featurePropertyWithoutEndpoint(state)} }}`,
                    discoveryEntry.discovery_payload.state_open = 'OPEN';
                discoveryEntry.discovery_payload.state_closed = 'CLOSE';
                discoveryEntry.discovery_payload.state_stopped = 'STOP';
            }
            if (!position && !tilt) {
                discoveryEntry.discovery_payload.optimistic = true;
            }
            if (position) {
                discoveryEntry.discovery_payload = { ...discoveryEntry.discovery_payload,
                    position_template: `{{ value_json.${featurePropertyWithoutEndpoint(position)} }}`,
                    set_position_template: `{ "${getProperty(position)}": {{ position }} }`,
                    set_position_topic: true,
                    position_topic: true,
                };
            }
            if (tilt) {
                discoveryEntry.discovery_payload = { ...discoveryEntry.discovery_payload,
                    tilt_command_topic: true,
                    tilt_status_topic: true,
                    tilt_status_template: `{{ value_json.${featurePropertyWithoutEndpoint(tilt)} }}`,
                };
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'fan') {
            (0, assert_1.default)(!endpoint, `Endpoint not supported for fan type`);
            const discoveryEntry = {
                type: 'fan',
                object_id: 'fan',
                mockProperties: [{ property: 'fan_state', value: null }],
                discovery_payload: {
                    state_topic: true,
                    state_value_template: '{{ value_json.fan_state }}',
                    command_topic: true,
                    command_topic_postfix: 'fan_state',
                },
            };
            const speed = firstExpose.features.find((e) => e.name === 'mode');
            if (speed) {
                // A fan entity in Home Assistant 2021.3 and above may have a speed,
                // controlled by a percentage from 1 to 100, and/or non-speed presets.
                // The MQTT Fan integration allows the speed percentage to be mapped
                // to a narrower range of speeds (e.g. 1-3), and for these speeds to be
                // translated to and from MQTT messages via templates.
                //
                // For the fixed fan modes in ZCL hvacFanCtrl, we model speeds "low",
                // "medium", and "high" as three speeds covering the full percentage
                // range as done in Home Assistant's zigpy fan integration, plus
                // presets "on", "auto" and "smart" to cover the remaining modes in
                // ZCL. This supports a generic ZCL HVAC Fan Control fan. "Off" is
                // always a valid speed.
                let speeds = ['off'].concat(['low', 'medium', 'high', '1', '2', '3', '4', '5',
                    '6', '7', '8', '9'].filter((s) => speed.values.includes(s)));
                let presets = ['on', 'auto', 'smart'].filter((s) => speed.values.includes(s));
                if (['99432'].includes(definition.model)) {
                    // The Hampton Bay 99432 fan implements 4 speeds using the ZCL
                    // hvacFanCtrl values `low`, `medium`, `high`, and `on`, and
                    // 1 preset called "Comfort Breeze" using the ZCL value `smart`.
                    // ZCL value `auto` is unused.
                    speeds = ['off', 'low', 'medium', 'high', 'on'];
                    presets = ['smart'];
                }
                const allowed = [...speeds, ...presets];
                speed.values.forEach((s) => (0, assert_1.default)(allowed.includes(s)));
                const percentValues = speeds.map((s, i) => `'${s}':${i}`).join(', ');
                const percentCommands = speeds.map((s, i) => `${i}:'${s}'`).join(', ');
                const presetList = presets.map((s) => `'${s}'`).join(', ');
                discoveryEntry.discovery_payload.percentage_state_topic = true;
                discoveryEntry.discovery_payload.percentage_command_topic = true;
                discoveryEntry.discovery_payload.percentage_value_template =
                    `{{ {${percentValues}}[value_json.${speed.property}] | default('None') }}`;
                discoveryEntry.discovery_payload.percentage_command_template =
                    `{{ {${percentCommands}}[value] | default('') }}`;
                discoveryEntry.discovery_payload.speed_range_min = 1;
                discoveryEntry.discovery_payload.speed_range_max = speeds.length - 1;
                (0, assert_1.default)(presets.length !== 0);
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                discoveryEntry.discovery_payload.preset_mode_command_topic = 'fan_mode';
                discoveryEntry.discovery_payload.preset_mode_value_template =
                    `{{ value_json.${speed.property} if value_json.${speed.property} in [${presetList}]` +
                        ` else 'None' | default('None') }}`;
                discoveryEntry.discovery_payload.preset_modes = presets;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'binary') {
            const lookup = {
                battery_low: { entity_category: 'diagnostic', device_class: 'battery' },
                button_lock: { entity_category: 'config', icon: 'mdi:lock' },
                calibration: { entity_category: 'config', icon: 'mdi:progress-wrench' },
                carbon_monoxide: { device_class: 'carbon_monoxide' },
                card: { entity_category: 'config', icon: 'mdi:clipboard-check' },
                child_lock: { entity_category: 'config', icon: 'mdi:account-lock' },
                color_sync: { entity_category: 'config', icon: 'mdi:sync-circle' },
                consumer_connected: { entity_category: 'diagnostic', device_class: 'connectivity' },
                contact: { device_class: 'door' },
                garage_door_contact: { device_class: 'garage_door', payload_on: false, payload_off: true },
                eco_mode: { entity_category: 'config', icon: 'mdi:leaf' },
                expose_pin: { entity_category: 'config', icon: 'mdi:pin' },
                flip_indicator_light: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                gas: { device_class: 'gas' },
                indicator_mode: { entity_category: 'config', icon: 'mdi:led-on' },
                invert_cover: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                led_disabled_night: { entity_category: 'config', icon: 'mdi:led-off' },
                led_indication: { entity_category: 'config', icon: 'mdi:led-on' },
                led_enable: { entity_category: 'config', icon: 'mdi:led-on' },
                legacy: { entity_category: 'config', icon: 'mdi:cog' },
                motor_reversal: { entity_category: 'config', icon: 'mdi:arrow-left-right' },
                moving: { device_class: 'moving' },
                no_position_support: { entity_category: 'config', icon: 'mdi:minus-circle-outline' },
                occupancy: { device_class: 'motion' },
                power_outage_memory: { entity_category: 'config', icon: 'mdi:memory' },
                presence: { device_class: 'presence' },
                smoke: { device_class: 'smoke' },
                sos: { device_class: 'safety' },
                tamper: { device_class: 'tamper' },
                temperature_scale: { entity_category: 'config', icon: 'mdi:temperature-celsius' },
                test: { entity_category: 'diagnostic', icon: 'mdi:test-tube' },
                valve_state: { device_class: 'opening' },
                vibration: { device_class: 'vibration' },
                water_leak: { device_class: 'moisture' },
                window: { device_class: 'window' },
            };
            /**
             * If Z2M binary attribute has SET access then expose it as `switch` in HA
             * There is also a check on the values for typeof boolean to prevent invalid values and commands
             * silently failing - commands work fine but some devices won't reject unexpected values.
             * https://github.com/Koenkk/zigbee2mqtt/issues/7740
             */
            if (firstExpose.access & ACCESS_SET) {
                const discoveryEntry = {
                    type: 'switch',
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    object_id: endpoint ?
                        `switch_${firstExpose.name}_${endpoint}` :
                        `switch_${firstExpose.name}`,
                    discovery_payload: {
                        value_template: typeof firstExpose.value_on === 'boolean' ?
                            `{% if value_json.${firstExpose.property} %} true {% else %} false {% endif %}` :
                            `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on.toString(),
                        payload_off: firstExpose.value_off.toString(),
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
            else {
                const discoveryEntry = {
                    type: 'binary_sensor',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        payload_on: firstExpose.value_on,
                        payload_off: firstExpose.value_off,
                        ...(lookup[firstExpose.name] || {}),
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        }
        else if (firstExpose.type === 'numeric') {
            const lookup = {
                ac_frequency: { device_class: 'frequency', enabled_by_default: false, entity_category: 'diagnostic',
                    state_class: 'measurement' },
                alarm_humidity_max: { device_class: 'humidity', icon: 'mdi:water-plus' },
                alarm_humidity_min: { device_class: 'humidity', icon: 'mdi:water-minus' },
                alarm_temperature_max: { device_class: 'temperature', icon: 'mdi:thermometer-high' },
                alarm_temperature_min: { device_class: 'temperature', icon: 'mdi:thermometer-low' },
                angle: { icon: 'angle-acute' },
                angle_axis: { icon: 'angle-acute' },
                aqi: { device_class: 'aqi', state_class: 'measurement' },
                auto_relock_time: { entity_category: 'config', icon: 'mdi:timer' },
                away_preset_days: { entity_category: 'config', icon: 'mdi:timer' },
                away_preset_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                battery: { device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement' },
                battery2: { device_class: 'battery', entity_category: 'diagnostic', state_class: 'measurement' },
                battery_voltage: { device_class: 'voltage', entity_category: 'diagnostic', state_class: 'measurement' },
                boost_heating_countdown: { device_class: 'duration' },
                boost_heating_countdown_time_set: { entity_category: 'config', icon: 'mdi:timer' },
                boost_time: { entity_category: 'config', icon: 'mdi:timer' },
                calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                calibration_time: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                co2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                comfort_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                cpu_temperature: {
                    device_class: 'temperature', entity_category: 'diagnostic', state_class: 'measurement',
                },
                cube_side: { icon: 'mdi:cube' },
                current: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                current_phase_b: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                current_phase_c: {
                    device_class: 'current',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                deadzone_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                device_temperature: {
                    device_class: 'temperature', entity_category: 'diagnostic', state_class: 'measurement',
                },
                duration: { entity_category: 'config', icon: 'mdi:timer' },
                eco2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                eco_temperature: { entity_category: 'config', icon: 'mdi:thermometer' },
                energy: { device_class: 'energy', state_class: 'total_increasing' },
                formaldehyd: { state_class: 'measurement' },
                gas_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                hcho: { icon: 'mdi:air-filter', state_class: 'measurement' },
                humidity: { device_class: 'humidity', state_class: 'measurement' },
                humidity_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                humidity_max: { entity_category: 'config', icon: 'mdi:water-percent' },
                humidity_min: { entity_category: 'config', icon: 'mdi:water-percent' },
                illuminance_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                illuminance_lux: { device_class: 'illuminance', state_class: 'measurement' },
                illuminance: { device_class: 'illuminance', enabled_by_default: false, state_class: 'measurement' },
                linkquality: {
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    icon: 'mdi:signal',
                    state_class: 'measurement',
                },
                local_temperature: { device_class: 'temperature', state_class: 'measurement' },
                max_temperature: { entity_category: 'config', icon: 'mdi:thermometer-high' },
                max_temperature_limit: { entity_category: 'config', icon: 'mdi:thermometer-high' },
                min_temperature_limit: { entity_category: 'config', icon: 'mdi:thermometer-low' },
                min_temperature: { entity_category: 'config', icon: 'mdi:thermometer-low' },
                measurement_poll_interval: { entity_category: 'config', icon: 'mdi:clock-out' },
                occupancy_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                pm10: { device_class: 'pm10', state_class: 'measurement' },
                pm25: { device_class: 'pm25', state_class: 'measurement' },
                people: { state_class: 'measurement', icon: 'mdi:account-multiple' },
                position: { icon: 'mdi:valve', state_class: 'measurement' },
                power: { device_class: 'power', entity_category: 'diagnostic', state_class: 'measurement' },
                power_factor: { device_class: 'power_factor', enabled_by_default: false,
                    entity_category: 'diagnostic', state_class: 'measurement' },
                precision: { entity_category: 'config', icon: 'mdi:decimal-comma-increase' },
                pressure: { device_class: 'pressure', state_class: 'measurement' },
                presence_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                reporting_time: { entity_category: 'config', icon: 'mdi:clock-time-one-outline' },
                requested_brightness_level: {
                    enabled_by_default: false, entity_category: 'diagnostic', icon: 'mdi:brightness-5',
                },
                requested_brightness_percent: {
                    enabled_by_default: false, entity_category: 'diagnostic', icon: 'mdi:brightness-5',
                },
                smoke_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                soil_moisture: { icon: 'mdi:water-percent', state_class: 'measurement' },
                temperature: { device_class: 'temperature', state_class: 'measurement' },
                temperature_calibration: { entity_category: 'config', icon: 'mdi:wrench-clock' },
                temperature_max: { entity_category: 'config', icon: 'mdi:thermometer-plus' },
                temperature_min: { entity_category: 'config', icon: 'mdi:thermometer-minus' },
                transition: { entity_category: 'config', icon: 'mdi:transition' },
                voc: { device_class: 'volatile_organic_compounds', state_class: 'measurement' },
                voc_index: { state_class: 'measurement' },
                vibration_timeout: { entity_category: 'config', icon: 'mdi:timer' },
                voltage: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                voltage_phase_b: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                voltage_phase_c: {
                    device_class: 'voltage',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                    state_class: 'measurement',
                },
                x_axis: { icon: 'mdi:axis-x-arrow' },
                y_axis: { icon: 'mdi:axis-y-arrow' },
                z_axis: { icon: 'mdi:axis-z-arrow' },
            };
            const extraAttrs = {};
            // If a variable includes Wh, mark it as energy
            if (firstExpose.unit && ['Wh', 'kWh'].includes(firstExpose.unit)) {
                Object.assign(extraAttrs, { device_class: 'energy', state_class: 'total_increasing' });
            }
            const allowsSet = firstExpose.access & ACCESS_SET;
            const discoveryEntry = {
                type: 'sensor',
                object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                mockProperties: [{ property: firstExpose.property, value: null }],
                discovery_payload: {
                    value_template: `{{ value_json.${firstExpose.property} }}`,
                    enabled_by_default: !allowsSet,
                    ...(firstExpose.unit && { unit_of_measurement: firstExpose.unit }),
                    ...lookup[firstExpose.name],
                    ...extraAttrs,
                },
            };
            // When a device_class is set, unit_of_measurement must be set, otherwise warnings are generated.
            // https://github.com/Koenkk/zigbee2mqtt/issues/15958#issuecomment-1377483202
            if (discoveryEntry.discovery_payload.device_class &&
                !discoveryEntry.discovery_payload.unit_of_measurement) {
                delete discoveryEntry.discovery_payload.device_class;
            }
            // Home Assistant only supports µg/m³, not other units like ppb.
            // https://github.com/Koenkk/zigbee2mqtt/issues/16057
            if (firstExpose.name === 'voc' && discoveryEntry.discovery_payload.unit_of_measurement !== 'µg/m³') {
                delete discoveryEntry.discovery_payload.device_class;
            }
            discoveryEntries.push(discoveryEntry);
            /**
             * If numeric attribute has SET access then expose as SELECT entity too.
             * Note: currently both sensor and number are discovered, this is to avoid
             * breaking changes for sensors already existing in HA (legacy).
             */
            if (allowsSet) {
                const discoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        ...(firstExpose.unit && { unit_of_measurement: firstExpose.unit }),
                        ...(firstExpose.value_step && { step: firstExpose.value_step }),
                        ...lookup[firstExpose.name],
                    },
                };
                if (((_d = lookup[firstExpose.name]) === null || _d === void 0 ? void 0 : _d.device_class) === 'temperature') {
                    discoveryEntry.discovery_payload.device_class == ((_e = lookup[firstExpose.name]) === null || _e === void 0 ? void 0 : _e.device_class);
                }
                else {
                    delete discoveryEntry.discovery_payload.device_class;
                }
                if (firstExpose.value_min != null)
                    discoveryEntry.discovery_payload.min = firstExpose.value_min;
                if (firstExpose.value_max != null)
                    discoveryEntry.discovery_payload.max = firstExpose.value_max;
                discoveryEntries.push(discoveryEntry);
            }
        }
        else if (firstExpose.type === 'enum') {
            const lookup = {
                action: { icon: 'mdi:gesture-double-tap' },
                alarm_humidity: { icon: 'mdi:water-percent-alert' },
                alarm_temperature: { icon: 'mdi:thermometer-alert' },
                backlight_auto_dim: { entity_category: 'config', icon: 'mdi:brightness-auto' },
                backlight_mode: { entity_category: 'config', icon: 'mdi:lightbulb' },
                color_power_on_behavior: { entity_category: 'config', icon: 'mdi:palette' },
                control_mode: { entity_category: 'config', icon: 'mdi:tune' },
                device_mode: { entity_category: 'config', icon: 'mdi:tune' },
                effect: { enabled_by_default: false, icon: 'mdi:palette' },
                force: { enabled_by_default: false, icon: 'mdi:valve' },
                keep_time: { entity_category: 'config', icon: 'mdi:av-timer' },
                keypad_lockout: { entity_category: 'config', icon: 'mdi:lock' },
                load_detection_mode: { entity_category: 'config', icon: 'mdi:tune' },
                load_dimmable: { entity_category: 'diagnostic', icon: 'mdi:chart-bell-curve' },
                load_type: { entity_category: 'diagnostic', icon: 'mdi:led-on' },
                melody: { entity_category: 'config', icon: 'mdi:music-note' },
                mode_phase_control: { entity_category: 'config', icon: 'mdi:tune' },
                mode: { entity_category: 'config', icon: 'mdi:tune' },
                motion_sensitivity: { entity_category: 'config', icon: 'mdi:tune' },
                operation_mode: { entity_category: 'config', icon: 'mdi:tune' },
                power_on_behavior: { entity_category: 'config', icon: 'mdi:power-settings' },
                power_outage_memory: { entity_category: 'config', icon: 'mdi:power-settings' },
                power_supply_mode: { entity_category: 'diagnostic', icon: 'mdi:power-settings' },
                power_type: { entity_category: 'diagnostic', icon: 'mdi:lightning-bolt-circle' },
                sensitivity: { entity_category: 'config', icon: 'mdi:tune' },
                sensors_type: { entity_category: 'config', icon: 'mdi:tune' },
                sound_volume: { entity_category: 'config', icon: 'mdi:volume-high' },
                status: { icon: 'mdi:state-machine' },
                switch_type: { entity_category: 'config', icon: 'mdi:tune' },
                temperature_sensor_select: { entity_category: 'config', icon: 'mdi:home-thermometer' },
                thermostat_unit: { entity_category: 'config', icon: 'mdi:thermometer' },
                volume: { entity_category: 'config', icon: 'mdi: volume-high' },
                week: { entity_category: 'config', icon: 'mdi:calendar-clock' },
            };
            const valueTemplate = firstExpose.access & ACCESS_STATE ?
                `{{ value_json.${firstExpose.property} }}` : undefined;
            if (firstExpose.access & ACCESS_STATE) {
                discoveryEntries.push({
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        value_template: valueTemplate,
                        enabled_by_default: !(firstExpose.access & ACCESS_SET),
                        ...lookup[firstExpose.name],
                    },
                });
            }
            /**
             * If enum attribute has SET access then expose as SELECT entity too.
             * Note: currently both sensor and select are discovered, this is to avoid
             * breaking changes for sensors already existing in HA (legacy).
             */
            if ((firstExpose.access & ACCESS_SET)) {
                discoveryEntries.push({
                    type: 'select',
                    object_id: firstExpose.property,
                    mockProperties: [],
                    discovery_payload: {
                        value_template: valueTemplate,
                        state_topic: !!(firstExpose.access & ACCESS_STATE),
                        command_topic_prefix: endpoint,
                        command_topic: true,
                        command_topic_postfix: firstExpose.property,
                        options: firstExpose.values.map((v) => v.toString()),
                        ...lookup[firstExpose.name],
                    },
                });
            }
        }
        else if (firstExpose.type === 'text' || firstExpose.type === 'composite' || firstExpose.type === 'list') {
            if (firstExpose.access & ACCESS_STATE) {
                const lookup = {
                    action: { icon: 'mdi:gesture-double-tap' },
                    programming_mode: { icon: 'mdi:calendar-clock' },
                    program: { value_template: `{{ value_json.${firstExpose.property} | truncate(254, True, '', 0) }}` },
                };
                const discoveryEntry = {
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [{ property: firstExpose.property, value: null }],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        ...lookup[firstExpose.name],
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        }
        else {
            throw new Error(`Unsupported exposes type: '${firstExpose.type}'`);
        }
        return discoveryEntries;
    }
    onDeviceRemoved(data) {
        var _a;
        logger_1.default.debug(`Clearing Home Assistant discovery topic for '${data.name}'`);
        (_a = this.discovered[data.ieeeAddr]) === null || _a === void 0 ? void 0 : _a.topics.forEach((topic) => {
            this.mqtt.publish(topic, null, { retain: true, qos: 0 }, this.discoveryTopic, false, false);
        });
        delete this.discovered[data.ieeeAddr];
    }
    onGroupMembersChanged(data) {
        this.discover(data.group, true);
    }
    async onPublishEntityState(data) {
        /**
         * In case we deal with a lightEndpoint configuration Zigbee2MQTT publishes
         * e.g. {state_l1: ON, brightness_l1: 250} to zigbee2mqtt/mydevice.
         * As the Home Assistant MQTT JSON light cannot be configured to use state_l1/brightness_l1
         * as the state variables, the state topic is set to zigbee2mqtt/mydevice/l1.
         * Here we retrieve all the attributes with the _l1 values and republish them on
         * zigbee2mqtt/mydevice/l1.
         */
        const entity = this.zigbee.resolveEntity(data.entity.name);
        if (entity.isDevice() && this.discovered[entity.ieeeAddr]) {
            for (const objectID of this.discovered[entity.ieeeAddr].objectIDs) {
                const lightMatch = /^light_(.*)/.exec(objectID);
                const coverMatch = /^cover_(.*)/.exec(objectID);
                const match = lightMatch || coverMatch;
                if (match) {
                    const endpoint = match[1];
                    const endpointRegExp = new RegExp(`(.*)_${endpoint}`);
                    const payload = {};
                    for (const key of Object.keys(data.message)) {
                        const keyMatch = endpointRegExp.exec(key);
                        if (keyMatch) {
                            payload[keyMatch[1]] = data.message[key];
                        }
                    }
                    await this.mqtt.publish(`${data.entity.name}/${endpoint}`, (0, json_stable_stringify_without_jsonify_1.default)(payload), {});
                }
            }
        }
        /**
         * Publish an empty value for click and action payload, in this way Home Assistant
         * can use Home Assistant entities in automations.
         * https://github.com/Koenkk/zigbee2mqtt/issues/959#issuecomment-480341347
         */
        if (settings.get().homeassistant.legacy_triggers) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                this.publishEntityState(data.entity, { [key]: '' });
            }
        }
        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_device/action
         */
        if (entity.isDevice() && entity.definition) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                const value = data.message[key].toString();
                await this.publishDeviceTriggerDiscover(entity, key, value);
                await this.mqtt.publish(`${data.entity.name}/${key}`, value, {});
            }
        }
    }
    async onEntityRenamed(data) {
        logger_1.default.debug(`Refreshing Home Assistant discovery topic for '${data.entity.name}'`);
        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (data.homeAssisantRename) {
            for (const config of this.getConfigs(data.entity)) {
                const topic = this.getDiscoveryTopic(config, data.entity);
                this.mqtt.publish(topic, null, { retain: true, qos: 0 }, this.discoveryTopic, false, false);
            }
            // Make sure Home Assistant deletes the old entity first otherwise another one (_2) is created
            // https://github.com/Koenkk/zigbee2mqtt/issues/12610
            await utils_1.default.sleep(2);
        }
        this.discover(data.entity, true);
        if (data.entity.isDevice() && this.discoveredTriggers[data.entity.ieeeAddr]) {
            for (const config of this.discoveredTriggers[data.entity.ieeeAddr]) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                this.publishDeviceTriggerDiscover(data.entity, key, value, true);
            }
        }
    }
    getConfigs(entity) {
        const isDevice = entity.isDevice();
        /* istanbul ignore next */
        if (!entity || (isDevice && !entity.definition))
            return [];
        let configs = [];
        if (isDevice) {
            const exposes = entity.exposes(); // avoid calling it hundred of times/s
            for (const expose of exposes) {
                configs.push(...this.exposeToConfig([expose], 'device', exposes, entity.definition));
            }
            for (const mapping of legacyMapping) {
                if (mapping.models.includes(entity.definition.model)) {
                    configs.push(mapping.discovery);
                }
            }
            // Deprecated in favour of exposes
            /* istanbul ignore if */
            if (entity.definition.hasOwnProperty('homeassistant')) {
                // @ts-ignore
                configs.push(entity.definition.homeassistant);
            }
        }
        else { // group
            const exposesByType = {};
            const allExposes = [];
            entity.zh.members.map((e) => this.zigbee.resolveEntity(e.getDevice()))
                .filter((d) => d.definition).forEach((device) => {
                const exposes = device.exposes();
                allExposes.push(...exposes);
                for (const expose of exposes.filter((e) => groupSupportedTypes.includes(e.type))) {
                    let key = expose.type;
                    if (['switch', 'lock', 'cover'].includes(expose.type) && expose.endpoint) {
                        // A device can have multiple of these types which have to discovered seperately.
                        // e.g. switch with property state and valve_detection.
                        const state = expose.features.find((f) => f.name === 'state');
                        key += featurePropertyWithoutEndpoint(state);
                    }
                    if (!exposesByType[key])
                        exposesByType[key] = [];
                    exposesByType[key].push(expose);
                }
            });
            configs = [].concat(...Object.values(exposesByType)
                .map((exposes) => this.exposeToConfig(exposes, 'group', allExposes)));
        }
        if (isDevice && settings.get().advanced.last_seen !== 'disable') {
            const config = {
                type: 'sensor',
                object_id: 'last_seen',
                mockProperties: [{ property: 'last_seen', value: null }],
                discovery_payload: {
                    value_template: '{{ value_json.last_seen }}',
                    icon: 'mdi:clock',
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };
            /* istanbul ignore else */
            if (settings.get().advanced.last_seen.startsWith('ISO_8601')) {
                config.discovery_payload.device_class = 'timestamp';
            }
            configs.push(config);
        }
        if (isDevice && entity.definition.hasOwnProperty('ota')) {
            const updateStateSensor = {
                type: 'sensor',
                object_id: 'update_state',
                mockProperties: [],
                discovery_payload: {
                    icon: 'mdi:update',
                    value_template: `{{ value_json['update']['state'] }}`,
                    enabled_by_default: false,
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateStateSensor);
            const updateAvailableSensor = {
                type: 'binary_sensor',
                object_id: 'update_available',
                mockProperties: [{ property: 'update_available', value: null }],
                discovery_payload: {
                    payload_on: true,
                    payload_off: false,
                    value_template: `{{ value_json['update']['state'] == "available" }}`,
                    enabled_by_default: false,
                    device_class: 'update',
                    entity_category: 'diagnostic',
                },
            };
            configs.push(updateAvailableSensor);
            const updateSensor = {
                type: 'update',
                object_id: 'update',
                mockProperties: [{ property: 'update', value: { state: null } }],
                discovery_payload: {
                    entity_picture: 'https://github.com/Koenkk/zigbee2mqtt/raw/master/images/logo.png',
                    latest_version_topic: true,
                    state_topic: true,
                    device_class: 'firmware',
                    command_topic: `${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/update`,
                    payload_install: `{"id": "${entity.ieeeAddr}"}`,
                    value_template: `{{ value_json['update']['installed_version'] }}`,
                    latest_version_template: `{{ value_json['update']['latest_version'] }}`,
                },
            };
            configs.push(updateSensor);
        }
        if (isDevice && entity.options.hasOwnProperty('legacy') && !entity.options.legacy) {
            configs = configs.filter((c) => c !== sensorClick);
        }
        if (!settings.get().homeassistant.legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }
        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));
        if (entity.options.homeassistant) {
            const s = entity.options.homeassistant;
            configs = configs.filter((config) => !s.hasOwnProperty(config.object_id) || s[config.object_id] != null);
            configs.forEach((config) => {
                const configOverride = s[config.object_id];
                if (configOverride) {
                    config.object_id = configOverride.object_id || config.object_id;
                    config.type = configOverride.type || config.type;
                }
            });
        }
        return configs;
    }
    getDiscoverKey(entity) {
        return entity.isDevice() ? entity.ieeeAddr : entity.ID;
    }
    discover(entity, force = false) {
        // Check if already discovered and check if there are configs.
        const discoverKey = this.getDiscoverKey(entity);
        const discover = force || !this.discovered[discoverKey];
        if (entity.isGroup()) {
            if (!discover || entity.zh.members.length === 0)
                return;
        }
        else if (!discover || !entity.definition || entity.zh.interviewing ||
            (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant)) {
            return;
        }
        this.discovered[discoverKey] = { topics: new Set(), mockProperties: new Set(), objectIDs: new Set() };
        this.getConfigs(entity).forEach((config) => {
            var _a;
            const payload = { ...config.discovery_payload };
            const baseTopic = `${settings.get().mqtt.base_topic}/${entity.name}`;
            let stateTopic = baseTopic;
            if (payload.state_topic_postfix) {
                stateTopic += `/${payload.state_topic_postfix}`;
                delete payload.state_topic_postfix;
            }
            if (!payload.hasOwnProperty('state_topic') || payload.state_topic) {
                payload.state_topic = stateTopic;
            }
            else {
                /* istanbul ignore else */
                if (payload.hasOwnProperty('state_topic')) {
                    delete payload.state_topic;
                }
            }
            if (payload.position_topic) {
                payload.position_topic = stateTopic;
            }
            if (payload.tilt_status_topic) {
                payload.tilt_status_topic = stateTopic;
            }
            if (this.entityAttributes) {
                payload.json_attributes_topic = stateTopic;
            }
            const devicePayload = this.getDevicePayload(entity);
            // Set (unique) name, separate by space if device name contains space.
            const nameSeparator = devicePayload.name.includes('_') ? '_' : ' ';
            payload.name = devicePayload.name;
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.name += `${nameSeparator}${config.object_id.split(/_(.+)/)[1]}`;
            }
            else if (!config.object_id.startsWith(config.type)) {
                payload.name += `${nameSeparator}${config.object_id.replace(/_/g, nameSeparator)}`;
            }
            // Set unique_id
            payload.unique_id = `${entity.options.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;
            // Attributes for device registry
            payload.device = devicePayload;
            // Availability payload
            payload.availability = [{ topic: `${settings.get().mqtt.base_topic}/bridge/state` }];
            /* istanbul ignore next */
            if (utils_1.default.isAvailabilityEnabledForEntity(entity, settings.get())) {
                payload.availability_mode = 'all';
                payload.availability.push({ topic: `${baseTopic}/availability` });
            }
            if (entity.isDevice() && entity.options.disabled) {
                // Mark disabled device always as unavailable
                payload.availability.forEach((a) => a.value_template = '{{ "offline" }}');
            }
            else if (!settings.get().advanced.legacy_availability_payload) {
                payload.availability.forEach((a) => a.value_template = '{{ value_json.state }}');
            }
            const commandTopicPrefix = payload.command_topic_prefix ? `${payload.command_topic_prefix}/` : '';
            delete payload.command_topic_prefix;
            const commandTopicPostfix = payload.command_topic_postfix ? `/${payload.command_topic_postfix}` : '';
            delete payload.command_topic_postfix;
            const commandTopic = `${baseTopic}/${commandTopicPrefix}set${commandTopicPostfix}`;
            if (payload.command_topic && typeof payload.command_topic !== 'string') {
                payload.command_topic = commandTopic;
            }
            if (payload.set_position_topic) {
                payload.set_position_topic = commandTopic;
            }
            if (payload.tilt_command_topic) {
                payload.tilt_command_topic = `${baseTopic}/${commandTopicPrefix}set/tilt`;
            }
            if (payload.mode_state_topic) {
                payload.mode_state_topic = stateTopic;
            }
            if (payload.mode_command_topic) {
                payload.mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/system_mode`;
            }
            if (payload.current_temperature_topic) {
                payload.current_temperature_topic = stateTopic;
            }
            if (payload.temperature_state_topic) {
                payload.temperature_state_topic = stateTopic;
            }
            if (payload.temperature_low_state_topic) {
                payload.temperature_low_state_topic = stateTopic;
            }
            if (payload.temperature_high_state_topic) {
                payload.temperature_high_state_topic = stateTopic;
            }
            if (payload.temperature_command_topic) {
                payload.temperature_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_command_topic}`;
            }
            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_low_command_topic}`;
            }
            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic =
                    `${baseTopic}/${commandTopicPrefix}set/${payload.temperature_high_command_topic}`;
            }
            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }
            if (payload.latest_version_topic) {
                payload.latest_version_topic = stateTopic;
            }
            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }
            if (payload.swing_mode_state_topic) {
                payload.swing_mode_state_topic = stateTopic;
            }
            if (payload.swing_mode_command_topic) {
                payload.swing_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/swing_mode`;
            }
            if (payload.percentage_state_topic) {
                payload.percentage_state_topic = stateTopic;
            }
            if (payload.percentage_command_topic) {
                payload.percentage_command_topic = `${baseTopic}/${commandTopicPrefix}set/fan_mode`;
            }
            if (payload.preset_mode_state_topic) {
                payload.preset_mode_state_topic = stateTopic;
            }
            if (payload.preset_mode_command_topic) {
                payload.preset_mode_command_topic = `${baseTopic}/${commandTopicPrefix}set/` +
                    payload.preset_mode_command_topic;
            }
            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }
            // Override configuration with user settings.
            if (entity.options.hasOwnProperty('homeassistant')) {
                const add = (obj, ignoreName) => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        }
                        else if (ignoreName && key === 'name') {
                            return;
                        }
                        else if (['number', 'string', 'boolean'].includes(typeof obj[key]) ||
                            Array.isArray(obj[key])) {
                            payload[key] = obj[key];
                        }
                        else if (obj[key] === null) {
                            delete payload[key];
                        }
                        else if (key === 'device' && typeof obj[key] === 'object') {
                            Object.keys(obj['device']).forEach((key) => {
                                payload['device'][key] = obj['device'][key];
                            });
                        }
                    });
                };
                add(entity.options.homeassistant, true);
                if (entity.options.homeassistant.hasOwnProperty(config.object_id)) {
                    add(entity.options.homeassistant[config.object_id], false);
                }
            }
            const topic = this.getDiscoveryTopic(config, entity);
            this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 }, this.discoveryTopic, false, false);
            this.discovered[discoverKey].topics.add(topic);
            this.discovered[discoverKey].objectIDs.add(config.object_id);
            (_a = config.mockProperties) === null || _a === void 0 ? void 0 : _a.forEach((mockProperty) => this.discovered[discoverKey].mockProperties.add(mockProperty));
        });
    }
    onMQTTMessage(data) {
        const discoveryRegex = new RegExp(`${this.discoveryTopic}/(.*)/(.*)/(.*)/config`);
        const discoveryMatch = data.topic.match(discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discovered device_automations
            let message = null;
            try {
                message = JSON.parse(data.message);
                const baseTopic = settings.get().mqtt.base_topic + '/';
                if (isDeviceAutomation && (!message.topic || !message.topic.startsWith(baseTopic))) {
                    return;
                }
                if (!isDeviceAutomation &&
                    (!message.availability || !message.availability[0].topic.startsWith(baseTopic))) {
                    return;
                }
            }
            catch (e) {
                return;
            }
            // Group discovery topic uses "ENCODEDBASETOPIC_GROUPID", device use ieeeAddr
            const ID = discoveryMatch[2].includes('_') ? discoveryMatch[2].split('_')[1] : discoveryMatch[2];
            const entity = this.zigbee.resolveEntity(ID);
            let clear = !entity || entity.isDevice() && !entity.definition;
            // Only save when topic matches otherwise config is not updated when renamed by editing configuration.yaml
            if (entity) {
                const key = `${discoveryMatch[3].substring(0, discoveryMatch[3].indexOf('_'))}`;
                const triggerTopic = `${settings.get().mqtt.base_topic}/${entity.name}/${key}`;
                if (isDeviceAutomation && message.topic === triggerTopic) {
                    if (!this.discoveredTriggers[ID]) {
                        this.discoveredTriggers[ID] = new Set();
                    }
                    this.discoveredTriggers[ID].add(discoveryMatch[3]);
                }
            }
            if (!clear && !isDeviceAutomation) {
                const type = discoveryMatch[1];
                const objectID = discoveryMatch[3];
                clear = !this.getConfigs(entity)
                    .find((c) => c.type === type && c.object_id === objectID &&
                    `${this.discoveryTopic}/${this.getDiscoveryTopic(c, entity)}` === data.topic);
            }
            // Device was flagged to be excluded from homeassistant discovery
            clear = clear || (entity.options.hasOwnProperty('homeassistant') && !entity.options.homeassistant);
            if (clear) {
                logger_1.default.debug(`Clearing Home Assistant config '${data.topic}'`);
                const topic = data.topic.substring(this.discoveryTopic.length + 1);
                this.mqtt.publish(topic, null, { retain: true, qos: 0 }, this.discoveryTopic, false, false);
            }
        }
        else if ((data.topic === this.statusTopic || data.topic === defaultStatusTopic) &&
            data.message.toLowerCase() === 'online') {
            const timer = setTimeout(async () => {
                // Publish all device states.
                for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
                    if (this.state.exists(entity)) {
                        this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                    }
                }
                clearTimeout(timer);
            }, 30000);
        }
    }
    onZigbeeEvent(data) {
        this.discover(data.device);
    }
    getDevicePayload(entity) {
        var _a, _b, _c;
        const identifierPostfix = entity.isGroup() ?
            `zigbee2mqtt_${this.getEncodedBaseTopic()}` : 'zigbee2mqtt';
        // Allow device name to be overridden by homeassistant config
        let deviceName = entity.name;
        if (typeof ((_a = entity.options.homeassistant) === null || _a === void 0 ? void 0 : _a.name) === 'string') {
            deviceName = entity.options.homeassistant.name;
        }
        const payload = {
            identifiers: [`${identifierPostfix}_${entity.options.ID}`],
            name: deviceName,
            sw_version: `Zigbee2MQTT ${this.zigbee2MQTTVersion}`,
        };
        if (entity.isDevice()) {
            payload.model = `${entity.definition.description} (${entity.definition.model})`;
            payload.manufacturer = entity.definition.vendor;
            payload.sw_version = entity.zh.softwareBuildID;
        }
        if ((_b = settings.get().frontend) === null || _b === void 0 ? void 0 : _b.url) {
            const url = (_c = settings.get().frontend) === null || _c === void 0 ? void 0 : _c.url;
            payload.configuration_url = entity.isDevice() ? `${url}/#/device/${entity.ieeeAddr}/info` :
                `${url}/#/group/${entity.ID}`;
        }
        return payload;
    }
    adjustMessageBeforePublish(entity, message) {
        var _a, _b, _c, _d;
        const discoverKey = this.getDiscoverKey(entity);
        (_b = (_a = this.discovered[discoverKey]) === null || _a === void 0 ? void 0 : _a.mockProperties) === null || _b === void 0 ? void 0 : _b.forEach((mockProperty) => {
            if (!message.hasOwnProperty(mockProperty.property)) {
                message[mockProperty.property] = mockProperty.value;
            }
        });
        // Copy hue -> h, saturation -> s to make homeassistant happy
        if (message.hasOwnProperty('color')) {
            if (message.color.hasOwnProperty('hue')) {
                message.color.h = message.color.hue;
            }
            if (message.color.hasOwnProperty('saturation')) {
                message.color.s = message.color.saturation;
            }
        }
        if (entity.isDevice() && ((_c = entity.definition) === null || _c === void 0 ? void 0 : _c.ota) && ((_d = message.update) === null || _d === void 0 ? void 0 : _d.latest_version) == null) {
            message.update = { ...message.update, installed_version: -1, latest_version: -1 };
        }
    }
    getEncodedBaseTopic() {
        return settings.get().mqtt.base_topic.split('').map((s) => s.charCodeAt(0).toString()).join('');
    }
    getDiscoveryTopic(config, entity) {
        const key = entity.isDevice() ? entity.ieeeAddr : `${this.getEncodedBaseTopic()}_${entity.ID}`;
        return `${config.type}/${key}/${config.object_id}/config`;
    }
    async publishDeviceTriggerDiscover(device, key, value, force = false) {
        const haConfig = device.options.homeassistant;
        if (device.options.hasOwnProperty('homeassistant') && (haConfig == null ||
            (haConfig.hasOwnProperty('device_automation') && typeof haConfig === 'object' &&
                haConfig.device_automation == null))) {
            return;
        }
        if (!this.discoveredTriggers[device.ieeeAddr]) {
            this.discoveredTriggers[device.ieeeAddr] = new Set();
        }
        const discoveredKey = `${key}_${value}`;
        if (this.discoveredTriggers[device.ieeeAddr].has(discoveredKey) && !force) {
            return;
        }
        const config = {
            type: 'device_automation',
            object_id: `${key}_${value}`,
            mockProperties: [],
            discovery_payload: {
                automation_type: 'trigger',
                type: key,
            },
        };
        const topic = this.getDiscoveryTopic(config, device);
        const payload = {
            ...config.discovery_payload,
            subtype: value,
            payload: value,
            topic: `${settings.get().mqtt.base_topic}/${device.name}/${key}`,
            device: this.getDevicePayload(device),
        };
        await this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 }, this.discoveryTopic, false, false);
        this.discoveredTriggers[device.ieeeAddr].add(discoveredKey);
    }
    _clearDiscoveredTrigger() {
        this.discoveredTriggers = {};
    }
}
exports.default = HomeAssistant;
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onDeviceRemoved", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onGroupMembersChanged", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onPublishEntityState", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onEntityRenamed", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onZigbeeEvent", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9tZWFzc2lzdGFudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vaG9tZWFzc2lzdGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsa0hBQThEO0FBQzlELG9EQUE0QjtBQUM1Qiw0REFBb0M7QUFDcEMsb0VBQWtDO0FBT2xDLE1BQU0sV0FBVyxHQUFtQjtJQUNoQyxJQUFJLEVBQUUsUUFBUTtJQUNkLFNBQVMsRUFBRSxPQUFPO0lBQ2xCLGNBQWMsRUFBRSxDQUFDLEVBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFDLENBQUM7SUFDbEQsaUJBQWlCLEVBQUU7UUFDZixJQUFJLEVBQUUsbUJBQW1CO1FBQ3pCLGNBQWMsRUFBRSx3QkFBd0I7S0FDM0M7Q0FDSixDQUFDO0FBRUYsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDO0FBQzNCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQztBQUN6QixNQUFNLG1CQUFtQixHQUFHLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDakUsTUFBTSxrQkFBa0IsR0FBRyxzQkFBc0IsQ0FBQztBQUVsRCxNQUFNLGFBQWEsR0FBRztJQUNsQjtRQUNJLE1BQU0sRUFBRSxDQUFDLFVBQVUsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsYUFBYTtZQUM1RixPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxVQUFVO1lBQzVGLFNBQVMsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGVBQWU7WUFDaEcsVUFBVSxFQUFFLFVBQVUs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