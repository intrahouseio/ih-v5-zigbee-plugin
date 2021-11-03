"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const assert_1 = __importDefault(require("assert"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const sensorClick = {
    type: 'sensor',
    object_id: 'click',
    mockProperties: ['click'],
    discovery_payload: {
        icon: 'mdi:toggle-switch',
        value_template: '{{ value_json.click }}',
    },
};
const ACCESS_STATE = 0b001;
const ACCESS_SET = 0b010;
const groupSupportedTypes = ['light', 'switch', 'lock', 'cover'];
const defaultStatusTopic = 'homeassistant/status';
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
        this.mapping = {};
        this.discoveredTriggers = {};
        this.legacyApi = settings.get().advanced.legacy_api;
        this.discoveryTopic = settings.get().advanced.homeassistant_discovery_topic;
        this.statusTopic = settings.get().advanced.homeassistant_status_topic;
        this.entityAttributes = settings.get().advanced.homeassistant_legacy_entity_attributes;
        if (settings.get().experimental.output === 'attribute') {
            throw new Error('Home Assistant integration is not possible with attribute output!');
        }
    }
    async start() {
        if (!settings.get().advanced.cache_state) {
            logger_1.default.warn('In order for Home Assistant integration to work properly set `cache_state: true');
        }
        this.zigbee2MQTTVersion = (await utils_1.default.getZigbee2MQTTVersion(false)).version;
        this.populateMapping();
        this.eventBus.onDeviceRemoved(this, this.onDeviceRemoved);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceRenamed(this, this.onDeviceRenamed);
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
        this.eventBus.onDeviceAnnounce(this, this.onZigbeeEvent);
        this.eventBus.onDeviceJoined(this, this.onZigbeeEvent);
        this.eventBus.onDeviceInterview(this, this.onZigbeeEvent);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        this.mqtt.subscribe(this.statusTopic);
        this.mqtt.subscribe(defaultStatusTopic);
        this.mqtt.subscribe(`${this.discoveryTopic}/#`);
        // MQTT discovery of all paired devices on startup.
        for (const entity of [...this.zigbee.devices(false), ...this.zigbee.groups()]) {
            this.discover(entity, true);
        }
    }
    exposeToConfig(exposes, entityType, definition) {
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
            const discoveryEntry = {
                type: 'light',
                object_id: endpoint ? `light_${endpoint}` : 'light',
                mockProperties: [state.property],
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
                hasColorXY ? 'xy' : null,
                !hasColorXY && hasColorHS ? 'hs' : null,
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
            const effect = definition && definition.exposes.find((e) => e.type === 'enum' && e.name === 'effect');
            if (effect) {
                discoveryEntry.discovery_payload.effect = true;
                discoveryEntry.discovery_payload.effect_list = effect.values;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'switch') {
            const state = firstExpose.features.find((f) => f.name === 'state');
            const property = getProperty(state);
            const discoveryEntry = {
                type: 'switch',
                object_id: endpoint ? `switch_${endpoint}` : 'switch',
                mockProperties: [property],
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
                },
            };
            const mode = firstExpose.features.find((f) => f.name === 'system_mode');
            if (mode) {
                if (mode.values.includes('sleep')) {
                    // 'sleep' is not supported by homeassistent, but is valid according to ZCL
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
                discoveryEntry.mockProperties.push(state.property);
                discoveryEntry.discovery_payload.action_topic = true;
                discoveryEntry.discovery_payload.action_template = `{% set values = ` +
                    `{None:None,'idle':'off','heat':'heating','cool':'cooling','fan only':'fan'}` +
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
            const preset = firstExpose.features.find((f) => f.name === 'preset');
            if (preset) {
                discoveryEntry.discovery_payload.hold_modes = preset.values;
                discoveryEntry.discovery_payload.hold_command_topic = true;
                discoveryEntry.discovery_payload.hold_state_template =
                    `{{ value_json.${preset.property} }}`;
                discoveryEntry.discovery_payload.hold_state_topic = true;
            }
            const awayMode = firstExpose.features.find((f) => f.name === 'away_mode');
            if (awayMode) {
                discoveryEntry.discovery_payload.away_mode_command_topic = true;
                discoveryEntry.discovery_payload.away_mode_state_topic = true;
                discoveryEntry.discovery_payload.away_mode_state_template =
                    `{{ value_json.${awayMode.property} }}`;
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
                mockProperties: [state.property],
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
            const position = exposes.find((expose) => expose.features.find((e) => e.name === 'position'));
            const hasTilt = exposes.find((expose) => expose.features.find((e) => e.name === 'tilt'));
            const discoveryEntry = {
                type: 'cover',
                mockProperties: [],
                object_id: endpoint ? `cover_${endpoint}` : 'cover',
                discovery_payload: {},
            };
            // For covers only supporting tilt don't discover the command/state_topic, otherwise
            // HA does not correctly reflect the state
            // - https://github.com/home-assistant/core/issues/51793
            // - https://github.com/Koenkk/zigbee-herdsman-converters/pull/2663
            if (!hasTilt || (hasTilt && position)) {
                discoveryEntry.discovery_payload.command_topic = true;
                discoveryEntry.discovery_payload.state_topic = !position;
                discoveryEntry.discovery_payload.command_topic_prefix = endpoint;
            }
            if (!position && !hasTilt) {
                discoveryEntry.discovery_payload.optimistic = true;
            }
            if (position) {
                const p = position.features.find((f) => f.name === 'position');
                discoveryEntry.discovery_payload = { ...discoveryEntry.discovery_payload,
                    position_template: `{{ value_json.${getProperty(p)} }}`,
                    set_position_template: `{ "${getProperty(p)}": {{ position }} }`,
                    set_position_topic: true,
                    position_topic: true,
                };
            }
            if (hasTilt) {
                (0, assert_1.default)(!endpoint, `Endpoint with tilt not supported for cover type`);
                discoveryEntry.discovery_payload = { ...discoveryEntry.discovery_payload,
                    tilt_command_topic: true,
                    tilt_status_topic: true,
                    tilt_status_template: '{{ value_json.tilt }}',
                };
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'fan') {
            (0, assert_1.default)(!endpoint, `Endpoint not supported for fan type`);
            const discoveryEntry = {
                type: 'fan',
                object_id: 'fan',
                mockProperties: ['fan_state'],
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
                let speeds = ['off'].concat(['low', 'medium', 'high'].filter((s) => speed.values.includes(s)));
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
                discoveryEntry.discovery_payload.preset_mode_state_topic = true;
                discoveryEntry.discovery_payload.preset_mode_command_topic = true;
                discoveryEntry.discovery_payload.preset_mode_value_template =
                    `{{ value_json.${speed.property} if value_json.${speed.property} in [${presetList}]` +
                        ` else 'None' | default('None') }}`;
                discoveryEntry.discovery_payload.preset_modes = presets;
            }
            discoveryEntries.push(discoveryEntry);
        }
        else if (firstExpose.type === 'binary') {
            const lookup = {
                occupancy: { device_class: 'motion' },
                battery_low: { device_class: 'battery' },
                water_leak: { device_class: 'moisture' },
                vibration: { device_class: 'vibration' },
                contact: { device_class: 'door' },
                smoke: { device_class: 'smoke' },
                gas: { device_class: 'gas' },
                carbon_monoxide: { device_class: 'safety' },
                presence: { device_class: 'presence' },
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
                    mockProperties: [firstExpose.property],
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
                    mockProperties: [firstExpose.property],
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
                battery: { device_class: 'battery', state_class: 'measurement' },
                temperature: { device_class: 'temperature', state_class: 'measurement' },
                humidity: { device_class: 'humidity', state_class: 'measurement' },
                illuminance_lux: { device_class: 'illuminance', state_class: 'measurement' },
                illuminance: {
                    device_class: 'illuminance', enabled_by_default: false, state_class: 'measurement',
                },
                soil_moisture: { icon: 'mdi:water-percent', state_class: 'measurement' },
                position: { icon: 'mdi:valve', state_class: 'measurement' },
                pressure: { device_class: 'pressure', state_class: 'measurement' },
                power: { device_class: 'power', state_class: 'measurement' },
                linkquality: { enabled_by_default: false, icon: 'mdi:signal', state_class: 'measurement' },
                current: { device_class: 'current', state_class: 'measurement' },
                voltage: { device_class: 'voltage', enabled_by_default: false, state_class: 'measurement' },
                current_phase_b: { device_class: 'current', state_class: 'measurement' },
                voltage_phase_b: {
                    device_class: 'voltage', enabled_by_default: false, state_class: 'measurement',
                },
                current_phase_c: { device_class: 'current', state_class: 'measurement' },
                voltage_phase_c: {
                    device_class: 'voltage', enabled_by_default: false, state_class: 'measurement',
                },
                energy: {
                    device_class: 'energy',
                    state_class: 'total_increasing',
                },
                smoke_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                gas_density: { icon: 'mdi:google-circles-communities', state_class: 'measurement' },
                pm25: { device_class: 'pm25', state_class: 'measurement' },
                pm10: { device_class: 'pm10', state_class: 'measurement' },
                voc: { icon: 'mdi:air-filter', state_class: 'measurement' },
                aqi: { device_class: 'aqi', state_class: 'measurement' },
                hcho: { icon: 'mdi:air-filter', state_class: 'measurement' },
                requested_brightness_level: { enabled_by_default: false, icon: 'mdi:brightness-5' },
                requested_brightness_percent: { enabled_by_default: false, icon: 'mdi:brightness-5' },
                eco2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                co2: { device_class: 'carbon_dioxide', state_class: 'measurement' },
                local_temperature: { device_class: 'temperature', state_class: 'measurement' },
                x_axis: { icon: 'mdi:axis-x-arrow' },
                y_axis: { icon: 'mdi:axis-y-arrow' },
                z_axis: { icon: 'mdi:axis-z-arrow' },
            };
            const allowsSet = firstExpose.access & ACCESS_SET;
            const discoveryEntry = {
                type: 'sensor',
                object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                mockProperties: [firstExpose.property],
                discovery_payload: {
                    value_template: `{{ value_json.${firstExpose.property} }}`,
                    enabled_by_default: !allowsSet,
                    ...(firstExpose.unit && { unit_of_measurement: firstExpose.unit }),
                    ...lookup[firstExpose.name],
                },
            };
            discoveryEntries.push(discoveryEntry);
            /**
             * If numeric attribute has SET access then expose as SELECT entity too.
             * Note: currently both sensor and number are discoverd, this is to avoid
             * breaking changes for sensors already existing in HA (legacy).
             */
            if (allowsSet) {
                const discoveryEntry = {
                    type: 'number',
                    object_id: endpoint ? `${firstExpose.name}_${endpoint}` : `${firstExpose.name}`,
                    mockProperties: [firstExpose.property],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        command_topic: true,
                        command_topic_prefix: endpoint,
                        command_topic_postfix: firstExpose.property,
                        min: firstExpose.value_min != null ? firstExpose.value_min : -65535,
                        max: firstExpose.value_max != null ? firstExpose.value_max : 65535,
                        ...lookup[firstExpose.name],
                    },
                };
                discoveryEntries.push(discoveryEntry);
            }
        }
        else if (firstExpose.type === 'enum') {
            const lookup = {
                action: { icon: 'mdi:gesture-double-tap' },
                backlight_auto_dim: { enabled_by_default: false, icon: 'mdi:brightness-auto' },
                backlight_mode: { enabled_by_default: false, icon: 'mdi:lightbulb' },
                color_power_on_behavior: { enabled_by_default: false, icon: 'mdi:palette' },
                device_mode: { enabled_by_default: false, icon: 'mdi:tune' },
                keep_time: { enabled_by_default: false, icon: 'mdi:av-timer' },
                melody: { icon: 'mdi:music-note' },
                mode_phase_control: { enabled_by_default: false, icon: 'mdi:tune' },
                mode: { enabled_by_default: false, icon: 'mdi:tune' },
                motion_sensitivity: { enabled_by_default: false, icon: 'mdi:tune' },
                operation_mode: { enabled_by_default: false, icon: 'mdi:tune' },
                power_on_behavior: { enabled_by_default: false, icon: 'mdi:power-settings' },
                power_outage_memory: { enabled_by_default: false, icon: 'mdi:power-settings' },
                sensitivity: { enabled_by_default: false, icon: 'mdi:tune' },
                sensors_type: { enabled_by_default: false, icon: 'mdi:tune' },
                switch_type: { enabled_by_default: false, icon: 'mdi:tune' },
                volume: { icon: 'mdi: volume-high' },
            };
            if (firstExpose.access & ACCESS_STATE) {
                discoveryEntries.push({
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [firstExpose.property],
                    discovery_payload: {
                        value_template: `{{ value_json.${firstExpose.property} }}`,
                        enabled_by_default: !(firstExpose.access & ACCESS_SET),
                        ...lookup[firstExpose.name],
                    },
                });
                /**
                 * If enum attribute has SET access then expose as SELECT entity too.
                 * Note: currently both sensor and select are discoverd, this is to avoid
                 * breaking changes for sensors already existing in HA (legacy).
                 */
                if ((firstExpose.access & ACCESS_SET)) {
                    discoveryEntries.push({
                        type: 'select',
                        object_id: firstExpose.property,
                        mockProperties: [firstExpose.property],
                        discovery_payload: {
                            value_template: `{{ value_json.${firstExpose.property} }}`,
                            state_topic: true,
                            command_topic_prefix: endpoint,
                            command_topic: true,
                            command_topic_postfix: firstExpose.property,
                            options: firstExpose.values.map((v) => v.toString()),
                            ...lookup[firstExpose.name],
                        },
                    });
                }
            }
        }
        else if (firstExpose.type === 'text' || firstExpose.type === 'composite') {
            if (firstExpose.access & ACCESS_STATE) {
                const lookup = {
                    action: { icon: 'mdi:gesture-double-tap' },
                };
                const discoveryEntry = {
                    type: 'sensor',
                    object_id: firstExpose.property,
                    mockProperties: [firstExpose.property],
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
    populateMapping() {
        for (const def of zigbee_herdsman_converters_1.default.definitions) {
            this.mapping[def.model] = [];
            if (['WXKG01LM', 'HS1EB/HS1EB-E', 'ICZB-KPD14S', 'TERNCY-SD01', 'TERNCY-PP01', 'ICZB-KPD18S',
                'E1766', 'ZWallRemote0', 'ptvo.switch', '2AJZ4KPKEY', 'ZGRC-KEY-013', 'HGZB-02S', 'HGZB-045',
                'HGZB-1S', 'AV2010/34', 'IM6001-BTP01', 'WXKG11LM', 'WXKG03LM', 'WXKG02LM_rev1', 'WXKG02LM_rev2',
                'QBKG04LM', 'QBKG03LM', 'QBKG11LM', 'QBKG21LM', 'QBKG22LM', 'WXKG12LM', 'QBKG12LM',
                'E1743'].includes(def.model)) {
                // deprecated
                this.mapping[def.model].push(sensorClick);
            }
            if (['ICTC-G-1'].includes(def.model)) {
                // deprecated
                this.mapping[def.model].push({
                    type: 'sensor',
                    mockProperties: ['brightness'],
                    object_id: 'brightness',
                    discovery_payload: {
                        unit_of_measurement: 'brightness',
                        icon: 'mdi:brightness-5',
                        value_template: '{{ value_json.brightness }}',
                    },
                });
            }
            for (const expose of def.exposes) {
                this.mapping[def.model].push(...this.exposeToConfig([expose], 'device', def));
            }
        }
        // Deprecated in favour of exposes
        for (const definition of utils_1.default.getExternalConvertersDefinitions(settings.get())) {
            if (definition.hasOwnProperty('homeassistant')) {
                this.mapping[definition.model] = definition.homeassistant;
            }
        }
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
        var _a;
        /**
         * In case we deal with a lightEndpoint configuration Zigbee2MQTT publishes
         * e.g. {state_l1: ON, brightness_l1: 250} to zigbee2mqtt/mydevice.
         * As the Home Assistant MQTT JSON light cannot be configured to use state_l1/brightness_l1
         * as the state variables, the state topic is set to zigbee2mqtt/mydevice/l1.
         * Here we retrieve all the attributes with the _l1 values and republish them on
         * zigbee2mqtt/mydevice/l1.
         */
        const entity = this.zigbee.resolveEntity(data.entity.name);
        if (entity.isDevice() && this.mapping[(_a = entity.definition) === null || _a === void 0 ? void 0 : _a.model]) {
            for (const config of this.mapping[entity.definition.model]) {
                const match = /light_(.*)/.exec(config['object_id']);
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
        if (settings.get().advanced.homeassistant_legacy_triggers) {
            const keys = ['action', 'click'].filter((k) => data.message[k]);
            for (const key of keys) {
                this.publishEntityState(data.entity, { [key]: '' });
            }
        }
        /**
         * Implements the MQTT device trigger (https://www.home-assistant.io/integrations/device_trigger.mqtt/)
         * The MQTT device trigger does not support JSON parsing, so it cannot listen to zigbee2mqtt/my_device
         * Whenever a device publish an {action: *} we discover an MQTT device trigger sensor
         * and republish it to zigbee2mqtt/my_devic/action
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
    onDeviceRenamed(data) {
        logger_1.default.debug(`Refreshing Home Assistant discovery topic for '${data.device.ieeeAddr}'`);
        // Clear before rename so Home Assistant uses new friendly_name
        // https://github.com/Koenkk/zigbee2mqtt/issues/4096#issuecomment-674044916
        if (data.homeAssisantRename) {
            for (const config of this.getConfigs(data.device)) {
                const topic = this.getDiscoveryTopic(config, data.device);
                this.mqtt.publish(topic, null, { retain: true, qos: 0 }, this.discoveryTopic, false, false);
            }
        }
        this.discover(data.device, true);
        if (this.discoveredTriggers[data.device.ieeeAddr]) {
            for (const config of this.discoveredTriggers[data.device.ieeeAddr]) {
                const key = config.substring(0, config.indexOf('_'));
                const value = config.substring(config.indexOf('_') + 1);
                this.publishDeviceTriggerDiscover(data.device, key, value, true);
            }
        }
    }
    getConfigs(entity) {
        const isDevice = entity.isDevice();
        /* istanbul ignore next */
        if (!entity || (isDevice && !entity.definition) ||
            (isDevice && !this.mapping[entity.definition.model]))
            return [];
        let configs;
        if (isDevice) {
            configs = this.mapping[entity.definition.model].slice();
        }
        else { // group
            const exposesByType = {};
            entity.membersDefinitions().forEach((definition) => {
                for (const expose of definition.exposes.filter((e) => groupSupportedTypes.includes(e.type))) {
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
                .map((exposes) => this.exposeToConfig(exposes, 'group')));
        }
        if (isDevice && settings.get().advanced.last_seen !== 'disable') {
            configs.push({
                type: 'sensor',
                object_id: 'last_seen',
                mockProperties: ['last_seen'],
                discovery_payload: {
                    icon: 'mdi:clock',
                    value_template: '{{ value_json.last_seen }}',
                    enabled_by_default: false,
                },
            });
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
                },
            };
            configs.push(updateStateSensor);
            if (this.legacyApi) {
                const updateAvailableSensor = {
                    type: 'binary_sensor',
                    object_id: 'update_available',
                    mockProperties: ['update_available'],
                    discovery_payload: {
                        payload_on: true,
                        payload_off: false,
                        value_template: '{{ value_json.update_available}}',
                        enabled_by_default: false,
                    },
                };
                configs.push(updateAvailableSensor);
            }
        }
        if (isDevice && entity.settings.hasOwnProperty('legacy') && !entity.settings.legacy) {
            configs = configs.filter((c) => c !== sensorClick);
        }
        if (!settings.get().advanced.homeassistant_legacy_triggers) {
            configs = configs.filter((c) => c.object_id !== 'action' && c.object_id !== 'click');
        }
        // deep clone of the config objects
        configs = JSON.parse(JSON.stringify(configs));
        if (entity.settings.homeassistant) {
            const s = entity.settings.homeassistant;
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
        // Check if already discoverd and check if there are configs.
        const discoverKey = this.getDiscoverKey(entity);
        const discover = force || !this.discovered[discoverKey];
        if (entity.isGroup()) {
            if (!discover || entity.zh.members.length === 0)
                return;
        }
        else if (!discover || !entity.definition || !this.mapping[entity.definition.model] ||
            entity.zh.interviewing ||
            (entity.settings.hasOwnProperty('homeassistant') && !entity.settings.homeassistant)) {
            return;
        }
        this.discovered[discoverKey] = { topics: new Set(), mockProperties: new Set() };
        this.getConfigs(entity).forEach((config) => {
            var _a;
            const payload = { ...config.discovery_payload };
            let stateTopic = `${settings.get().mqtt.base_topic}/${entity.name}`;
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
            // Set (unique) name, separate by space if friendlyName contains space.
            const nameSeparator = entity.name.includes('_') ? '_' : ' ';
            payload.name = entity.name;
            if (config.object_id.startsWith(config.type) && config.object_id.includes('_')) {
                payload.name += `${nameSeparator}${config.object_id.split(/_(.+)/)[1]}`;
            }
            else if (!config.object_id.startsWith(config.type)) {
                payload.name += `${nameSeparator}${config.object_id.replace(/_/g, nameSeparator)}`;
            }
            // Set unique_id
            payload.unique_id = `${entity.settings.ID}_${config.object_id}_${settings.get().mqtt.base_topic}`;
            // Attributes for device registry
            payload.device = this.getDevicePayload(entity);
            // Availability payload
            payload.availability = [{ topic: `${settings.get().mqtt.base_topic}/bridge/state` }];
            const availabilityEnabled = entity.isDevice() && utils_1.default.isAvailabilityEnabledForDevice(entity, settings.get());
            /* istanbul ignore next */
            if (availabilityEnabled) {
                payload.availability_mode = 'all';
                payload.availability.push({ topic: `${settings.get().mqtt.base_topic}/${entity.name}/availability` });
            }
            let commandTopic = `${settings.get().mqtt.base_topic}/${entity.name}/`;
            if (payload.command_topic_prefix) {
                commandTopic += `${payload.command_topic_prefix}/`;
                delete payload.command_topic_prefix;
            }
            commandTopic += 'set';
            if (payload.command_topic_postfix) {
                commandTopic += `/${payload.command_topic_postfix}`;
                delete payload.command_topic_postfix;
            }
            if (payload.command_topic) {
                payload.command_topic = commandTopic;
            }
            if (payload.set_position_topic) {
                payload.set_position_topic = commandTopic;
            }
            if (payload.tilt_command_topic) {
                // Home Assistant does not support templates to set tilt (as of 2019-08-17),
                // so we (have to) use a subtopic.
                payload.tilt_command_topic = commandTopic + '/tilt';
            }
            if (payload.mode_state_topic) {
                payload.mode_state_topic = stateTopic;
            }
            if (payload.mode_command_topic) {
                payload.mode_command_topic = `${stateTopic}/set/system_mode`;
            }
            if (payload.hold_command_topic) {
                payload.hold_command_topic = `${stateTopic}/set/preset`;
            }
            if (payload.hold_state_topic) {
                payload.hold_state_topic = stateTopic;
            }
            if (payload.away_mode_state_topic) {
                payload.away_mode_state_topic = stateTopic;
            }
            if (payload.away_mode_command_topic) {
                payload.away_mode_command_topic = `${stateTopic}/set/away_mode`;
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
                payload.temperature_command_topic = `${stateTopic}/set/${payload.temperature_command_topic}`;
            }
            if (payload.temperature_low_command_topic) {
                payload.temperature_low_command_topic = `${stateTopic}/set/${payload.temperature_low_command_topic}`;
            }
            if (payload.temperature_high_command_topic) {
                payload.temperature_high_command_topic = `${stateTopic}/set/${payload.temperature_high_command_topic}`;
            }
            if (payload.fan_mode_state_topic) {
                payload.fan_mode_state_topic = stateTopic;
            }
            if (payload.fan_mode_command_topic) {
                payload.fan_mode_command_topic = `${stateTopic}/set/fan_mode`;
            }
            if (payload.percentage_state_topic) {
                payload.percentage_state_topic = stateTopic;
            }
            if (payload.percentage_command_topic) {
                payload.percentage_command_topic = `${stateTopic}/set/fan_mode`;
            }
            if (payload.preset_mode_state_topic) {
                payload.preset_mode_state_topic = stateTopic;
            }
            if (payload.preset_mode_command_topic) {
                payload.preset_mode_command_topic = `${stateTopic}/set/fan_mode`;
            }
            if (payload.action_topic) {
                payload.action_topic = stateTopic;
            }
            // Override configuration with user settings.
            if (entity.settings.hasOwnProperty('homeassistant')) {
                const add = (obj) => {
                    Object.keys(obj).forEach((key) => {
                        if (['type', 'object_id'].includes(key)) {
                            return;
                        }
                        else if (['number', 'string', 'boolean'].includes(typeof obj[key])) {
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
                add(entity.settings.homeassistant);
                if (entity.settings.homeassistant.hasOwnProperty(config.object_id)) {
                    add(entity.settings.homeassistant[config.object_id]);
                }
            }
            const topic = this.getDiscoveryTopic(config, entity);
            this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 }, this.discoveryTopic, false, false);
            this.discovered[discoverKey].topics.add(topic);
            (_a = config.mockProperties) === null || _a === void 0 ? void 0 : _a.forEach((property) => this.discovered[discoverKey].mockProperties.add(property));
        });
    }
    onMQTTMessage(data) {
        const discoveryRegex = new RegExp(`${this.discoveryTopic}/(.*)/(.*)/(.*)/config`);
        const discoveryMatch = data.topic.match(discoveryRegex);
        const isDeviceAutomation = discoveryMatch && discoveryMatch[1] === 'device_automation';
        if (discoveryMatch) {
            // Clear outdated discovery configs and remember already discoverd device_automations
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
            clear = clear || (entity.settings.hasOwnProperty('homeassistant') && !entity.settings.homeassistant);
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
                for (const device of this.zigbee.devices(false)) {
                    if (this.state.exists(device)) {
                        this.publishEntityState(device, this.state.get(device));
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
        var _a, _b;
        const identifierPostfix = entity.isGroup() ?
            `zigbee2mqtt_${this.getEncodedBaseTopic()}` : 'zigbee2mqtt';
        const payload = {
            identifiers: [`${identifierPostfix}_${entity.settings.ID}`],
            name: entity.name,
            sw_version: `Zigbee2MQTT ${this.zigbee2MQTTVersion}`,
        };
        if (entity.isDevice()) {
            payload.model = `${entity.definition.description} (${entity.definition.model})`;
            payload.manufacturer = entity.definition.vendor;
        }
        if ((_a = settings.get().frontend) === null || _a === void 0 ? void 0 : _a.url) {
            const url = (_b = settings.get().frontend) === null || _b === void 0 ? void 0 : _b.url;
            payload.configuration_url = entity.isDevice() ? `${url}/#/device/${entity.ieeeAddr}/info` :
                `${url}/#/group/${entity.ID}`;
        }
        return payload;
    }
    adjustMessageBeforePublish(entity, message) {
        var _a, _b;
        const discoverKey = this.getDiscoverKey(entity);
        (_b = (_a = this.discovered[discoverKey]) === null || _a === void 0 ? void 0 : _a.mockProperties) === null || _b === void 0 ? void 0 : _b.forEach((property) => {
            if (!message.hasOwnProperty(property)) {
                message[property] = null;
            }
        });
        // Copy hue -> h, saturation -> s to make homeassitant happy
        if (message.hasOwnProperty('color')) {
            if (message.color.hasOwnProperty('hue')) {
                message.color.h = message.color.hue;
            }
            if (message.color.hasOwnProperty('saturation')) {
                message.color.s = message.color.saturation;
            }
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
        const haConfig = device.settings.homeassistant;
        if (device.settings.hasOwnProperty('homeassistant') && (haConfig == null ||
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
    // Only for homeassistant.test.js
    _getMapping() {
        return this.mapping;
    }
    _clearDiscoveredTrigger() {
        this.discoveredTriggers = {};
    }
}
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
], HomeAssistant.prototype, "onDeviceRenamed", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], HomeAssistant.prototype, "onZigbeeEvent", null);
exports.default = HomeAssistant;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9tZWFzc2lzdGFudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vaG9tZWFzc2lzdGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyREFBNkM7QUFDN0MsNERBQW9DO0FBQ3BDLDBEQUFrQztBQUNsQyxrSEFBOEQ7QUFDOUQsNEZBQWtFO0FBQ2xFLG9EQUE0QjtBQUM1Qiw0REFBb0M7QUFDcEMsb0VBQWtDO0FBS2xDLE1BQU0sV0FBVyxHQUFHO0lBQ2hCLElBQUksRUFBRSxRQUFRO0lBQ2QsU0FBUyxFQUFFLE9BQU87SUFDbEIsY0FBYyxFQUFFLENBQUMsT0FBTyxDQUFDO0lBQ3pCLGlCQUFpQixFQUFFO1FBQ2YsSUFBSSxFQUFFLG1CQUFtQjtRQUN6QixjQUFjLEVBQUUsd0JBQXdCO0tBQzNDO0NBQ0osQ0FBQztBQUVGLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQztBQUMzQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFDekIsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ2pFLE1BQU0sa0JBQWtCLEdBQUcsc0JBQXNCLENBQUM7QUFFbEQsTUFBTSw4QkFBOEIsR0FBRyxDQUFDLE9BQW9DLEVBQVUsRUFBRTtJQUNwRixJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUU7UUFDbEIsT0FBTyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUN2RTtTQUFNO1FBQ0gsT0FBTyxPQUFPLENBQUMsUUFBUSxDQUFDO0tBQzNCO0FBQ0wsQ0FBQyxDQUFDO0FBRUY7O0dBRUc7QUFDSCxNQUFxQixhQUFjLFNBQVEsbUJBQVM7SUFVaEQs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