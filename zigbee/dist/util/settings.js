"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.testing = exports.reRead = exports.changeFriendlyName = exports.changeEntityOptions = exports.removeGroup = exports.removeDeviceFromGroup = exports.addDeviceToGroup = exports.addGroup = exports.removeDevice = exports.blockDevice = exports.addDeviceToPasslist = exports.addDevice = exports.getDevice = exports.getGroups = exports.getGroup = exports.apply = exports.set = exports.get = exports.validate = exports.schema = void 0;
const data_1 = __importDefault(require("./data"));
const utils_1 = __importDefault(require("./utils"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("./yaml"));
const ajv_1 = __importDefault(require("ajv"));
const settings_schema_json_1 = __importDefault(require("./settings.schema.json"));
exports.schema = settings_schema_json_1.default;
// @ts-ignore
exports.schema = {};
(0, object_assign_deep_1.default)(exports.schema, settings_schema_json_1.default);
// Remove legacy settings from schema
{
    delete exports.schema.properties.advanced.properties.homeassistant_discovery_topic;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_entity_attributes;
    delete exports.schema.properties.advanced.properties.homeassistant_legacy_triggers;
    delete exports.schema.properties.advanced.properties.homeassistant_status_topic;
    delete exports.schema.properties.advanced.properties.soft_reset_timeout;
    delete exports.schema.properties.advanced.properties.report;
    delete exports.schema.properties.advanced.properties.baudrate;
    delete exports.schema.properties.advanced.properties.rtscts;
    delete exports.schema.properties.advanced.properties.ikea_ota_use_test_url;
    delete exports.schema.properties.experimental;
    delete settings_schema_json_1.default.properties.whitelist;
    delete settings_schema_json_1.default.properties.ban;
}
// DEPRECATED ZIGBEE2MQTT_CONFIG: https://github.com/Koenkk/zigbee2mqtt/issues/4697
const file = (_a = process.env.ZIGBEE2MQTT_CONFIG) !== null && _a !== void 0 ? _a : data_1.default.joinPath('configuration.yaml');
const ajvSetting = new ajv_1.default({ allErrors: true }).addKeyword('requiresRestart').compile(settings_schema_json_1.default);
const ajvRestartRequired = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s }).compile(settings_schema_json_1.default);
const ajvRestartRequiredDeviceOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s }).compile(settings_schema_json_1.default.definitions.device);
const ajvRestartRequiredGroupOptions = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (s) => !s }).compile(settings_schema_json_1.default.definitions.group);
const defaults = {
    permit_join: false,
    external_converters: [],
    mqtt: {
        base_topic: 'zigbee2mqtt',
        include_device_information: false,
        force_disable_retain: false,
    },
    serial: {
        disable_led: false,
    },
    passlist: [],
    blocklist: [],
    map_options: {
        graphviz: {
            colors: {
                fill: {
                    enddevice: '#fff8ce',
                    coordinator: '#e04e5d',
                    router: '#4ea3e0',
                },
                font: {
                    coordinator: '#ffffff',
                    router: '#ffffff',
                    enddevice: '#000000',
                },
                line: {
                    active: '#009900',
                    inactive: '#994444',
                },
            },
        },
    },
    ota: {
        update_check_interval: 24 * 60,
        disable_automatic_update_check: false,
    },
    device_options: {},
    advanced: {
        legacy_api: true,
        legacy_availability_payload: true,
        log_rotation: true,
        log_symlink_current: false,
        log_output: ['console', 'file'],
        log_directory: path_1.default.join(data_1.default.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.txt',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        log_syslog: {},
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        adapter_concurrent: null,
        adapter_delay: null,
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,
        last_seen: 'disable',
        elapsed: false,
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
        output: 'json',
        // Everything below is deprecated
        availability_blocklist: [],
        availability_passlist: [],
        availability_blacklist: [],
        availability_whitelist: [],
        soft_reset_timeout: 0,
        report: false,
    },
};
let _settings;
let _settingsWithDefaults;
function loadSettingsWithDefaults() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    _settingsWithDefaults = (0, object_assign_deep_1.default)({}, defaults, getInternalSettings());
    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }
    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
    }
    if (_settingsWithDefaults.homeassistant) {
        const defaults = { discovery_topic: 'homeassistant', status_topic: 'hass/status',
            legacy_entity_attributes: true, legacy_triggers: true };
        const sLegacy = {};
        if (_settingsWithDefaults.advanced) {
            for (const key of ['homeassistant_legacy_triggers', 'homeassistant_discovery_topic',
                'homeassistant_legacy_entity_attributes', 'homeassistant_status_topic']) {
                // @ts-ignore
                if (_settingsWithDefaults.advanced[key] !== undefined) {
                    // @ts-ignore
                    sLegacy[key.replace('homeassistant_', '')] = _settingsWithDefaults.advanced[key];
                }
            }
        }
        const s = typeof _settingsWithDefaults.homeassistant === 'object' ? _settingsWithDefaults.homeassistant : {};
        // @ts-ignore
        _settingsWithDefaults.homeassistant = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.homeassistant, defaults, sLegacy, s);
    }
    if (_settingsWithDefaults.availability || ((_a = _settingsWithDefaults.advanced) === null || _a === void 0 ? void 0 : _a.availability_timeout)) {
        const defaults = {};
        const s = typeof _settingsWithDefaults.availability === 'object' ? _settingsWithDefaults.availability : {};
        // @ts-ignore
        _settingsWithDefaults.availability = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.availability, defaults, s);
    }
    if (_settingsWithDefaults.frontend) {
        const defaults = { port: 8080, auth_token: false, host: '0.0.0.0' };
        const s = typeof _settingsWithDefaults.frontend === 'object' ? _settingsWithDefaults.frontend : {};
        // @ts-ignore
        _settingsWithDefaults.frontend = {};
        (0, object_assign_deep_1.default)(_settingsWithDefaults.frontend, defaults, s);
    }
    if (((_b = _settings.advanced) === null || _b === void 0 ? void 0 : _b.hasOwnProperty('baudrate')) && ((_c = _settings.serial) === null || _c === void 0 ? void 0 : _c.baudrate) == null) {
        // @ts-ignore
        _settingsWithDefaults.serial.baudrate = _settings.advanced.baudrate;
    }
    if (((_d = _settings.advanced) === null || _d === void 0 ? void 0 : _d.hasOwnProperty('rtscts')) && ((_e = _settings.serial) === null || _e === void 0 ? void 0 : _e.rtscts) == null) {
        // @ts-ignore
        _settingsWithDefaults.serial.rtscts = _settings.advanced.rtscts;
    }
    if (((_f = _settings.advanced) === null || _f === void 0 ? void 0 : _f.hasOwnProperty('ikea_ota_use_test_url')) && ((_g = _settings.ota) === null || _g === void 0 ? void 0 : _g.ikea_ota_use_test_url) == null) {
        // @ts-ignore
        _settingsWithDefaults.ota.ikea_ota_use_test_url = _settings.advanced.ikea_ota_use_test_url;
    }
    // @ts-ignore
    if (((_h = _settings.experimental) === null || _h === void 0 ? void 0 : _h.hasOwnProperty('transmit_power')) && ((_j = _settings.advanced) === null || _j === void 0 ? void 0 : _j.transmit_power) == null) {
        // @ts-ignore
        _settingsWithDefaults.advanced.transmit_power = _settings.experimental.transmit_power;
    }
    // @ts-ignore
    if (((_k = _settings.experimental) === null || _k === void 0 ? void 0 : _k.hasOwnProperty('output')) && ((_l = _settings.advanced) === null || _l === void 0 ? void 0 : _l.output) == null) {
        // @ts-ignore
        _settingsWithDefaults.advanced.output = _settings.experimental.output;
    }
    // @ts-ignore
    _settingsWithDefaults.ban && _settingsWithDefaults.blocklist.push(..._settingsWithDefaults.ban);
    // @ts-ignore
    _settingsWithDefaults.whitelist && _settingsWithDefaults.passlist.push(..._settingsWithDefaults.whitelist);
}
function parseValueRef(text) {
    const match = /!(.*) (.*)/g.exec(text);
    if (match) {
        let filename = match[1];
        // This is mainly for backward compatibility.
        if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
            filename += '.yaml';
        }
        return { filename, key: match[2] };
    }
    else {
        return null;
    }
}
function write() {
    const settings = getInternalSettings();
    const toWrite = (0, object_assign_deep_1.default)({}, settings);
    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml_1.default.read(file);
    // In case the setting is defined in a separate file (e.g. !secret network_key) update it there.
    for (const path of [
        ['mqtt', 'server'],
        ['mqtt', 'user'],
        ['mqtt', 'password'],
        ['advanced', 'network_key'],
        ['frontend', 'auth_token'],
    ]) {
        if (actual[path[0]] && actual[path[0]][path[1]]) {
            const ref = parseValueRef(actual[path[0]][path[1]]);
            if (ref) {
                yaml_1.default.updateIfChanged(data_1.default.joinPath(ref.filename), ref.key, toWrite[path[0]][path[1]]);
                toWrite[path[0]][path[1]] = actual[path[0]][path[1]];
            }
        }
    }
    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type) => {
        if (typeof actual[type] === 'string' || (Array.isArray(actual[type]) && actual[type].length > 0)) {
            const fileToWrite = Array.isArray(actual[type]) ? actual[type][0] : actual[type];
            const content = (0, object_assign_deep_1.default)({}, settings[type]);
            // If an array, only write to first file and only devices which are not in the other files.
            if (Array.isArray(actual[type])) {
                actual[type].filter((f, i) => i !== 0)
                    .map((f) => yaml_1.default.readIfExists(data_1.default.joinPath(f), {}))
                    .map((c) => Object.keys(c))
                    .forEach((k) => delete content[k]);
            }
            yaml_1.default.writeIfChanged(data_1.default.joinPath(fileToWrite), content);
            toWrite[type] = actual[type];
        }
    };
    writeDevicesOrGroups('devices');
    writeDevicesOrGroups('groups');
    yaml_1.default.writeIfChanged(file, toWrite);
    _settings = read();
    loadSettingsWithDefaults();
}
function validate() {
    try {
        getInternalSettings();
    }
    catch (error) {
        if (error.name === 'YAMLException') {
            return [
                `Your YAML file: '${error.file}' is invalid ` +
                    `(use https://jsonformatter.org/yaml-validator to find and fix the issue)`,
            ];
        }
        return [error.message];
    }
    if (!ajvSetting(_settings)) {
        return ajvSetting.errors.map((v) => `${v.instancePath.substring(1)} ${v.message}`);
    }
    const errors = [];
    if (_settings.advanced && _settings.advanced.network_key && typeof _settings.advanced.network_key === 'string' &&
        _settings.advanced.network_key !== 'GENERATE') {
        errors.push(`advanced.network_key: should be array or 'GENERATE' (is '${_settings.advanced.network_key}')`);
    }
    if (_settings.advanced && _settings.advanced.pan_id && typeof _settings.advanced.pan_id === 'string' &&
        _settings.advanced.pan_id !== 'GENERATE') {
        errors.push(`advanced.pan_id: should be number or 'GENERATE' (is '${_settings.advanced.pan_id}')`);
    }
    // Verify that all friendly names are unique
    const names = [];
    const check = (e) => {
        if (names.includes(e.friendly_name))
            errors.push(`Duplicate friendly_name '${e.friendly_name}' found`);
        errors.push(...utils_1.default.validateFriendlyName(e.friendly_name));
        names.push(e.friendly_name);
        if (e.qos != null && ![0, 1, 2].includes(e.qos)) {
            errors.push(`QOS for '${e.friendly_name}' not valid, should be 0, 1 or 2 got ${e.qos}`);
        }
    };
    const settingsWithDefaults = get();
    Object.values(settingsWithDefaults.devices).forEach((d) => check(d));
    Object.values(settingsWithDefaults.groups).forEach((g) => check(g));
    if (settingsWithDefaults.mqtt.version !== 5) {
        for (const device of Object.values(settingsWithDefaults.devices)) {
            if (device.retention) {
                errors.push('MQTT retention requires protocol version 5');
            }
        }
    }
    const checkAvailabilityList = (list, type) => {
        list.forEach((e) => {
            if (!getDevice(e)) {
                errors.push(`Non-existing entity '${e}' specified in '${type}'`);
            }
        });
    };
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blacklist, 'availability_blacklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_whitelist, 'availability_whitelist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_blocklist, 'availability_blocklist');
    checkAvailabilityList(settingsWithDefaults.advanced.availability_passlist, 'availability_passlist');
    return errors;
}
exports.validate = validate;
function read() {
    var _a, _b, _c, _d, _e;
    const s = yaml_1.default.read(file);
    applyEnvironmentVariables(s);
    // Read !secret MQTT username and password if set
    // eslint-disable-next-line
    const interpretValue = (value) => {
        const ref = parseValueRef(value);
        if (ref) {
            return yaml_1.default.read(data_1.default.joinPath(ref.filename))[ref.key];
        }
        else {
            return value;
        }
    };
    if ((_a = s.mqtt) === null || _a === void 0 ? void 0 : _a.user) {
        s.mqtt.user = interpretValue(s.mqtt.user);
    }
    if ((_b = s.mqtt) === null || _b === void 0 ? void 0 : _b.password) {
        s.mqtt.password = interpretValue(s.mqtt.password);
    }
    if ((_c = s.mqtt) === null || _c === void 0 ? void 0 : _c.server) {
        s.mqtt.server = interpretValue(s.mqtt.server);
    }
    if ((_d = s.advanced) === null || _d === void 0 ? void 0 : _d.network_key) {
        s.advanced.network_key = interpretValue(s.advanced.network_key);
    }
    if ((_e = s.frontend) === null || _e === void 0 ? void 0 : _e.auth_token) {
        s.frontend.auth_token = interpretValue(s.frontend.auth_token);
    }
    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type) => {
        if (typeof s[type] === 'string' || (Array.isArray(s[type]) && Array(s[type]).length > 0)) {
            /* eslint-disable-line */ // @ts-ignore
            const files = Array.isArray(s[type]) ? s[type] : [s[type]];
            s[type] = {};
            for (const file of files) {
                const content = yaml_1.default.readIfExists(data_1.default.joinPath(file), {});
                /* eslint-disable-line */ // @ts-ignore
                s[type] = object_assign_deep_1.default.noMutate(s[type], content);
            }
        }
    };
    readDevicesOrGroups('devices');
    readDevicesOrGroups('groups');
    return s;
}
function applyEnvironmentVariables(settings) {
    const iterate = (obj, path) => {
        Object.keys(obj).forEach((key) => {
            if (key !== 'type') {
                if (key !== 'properties' && obj[key]) {
                    const type = (obj[key].type || 'object').toString();
                    const envPart = path.reduce((acc, val) => `${acc}${val}_`, '');
                    const envVariableName = (`ZIGBEE2MQTT_CONFIG_${envPart}${key}`).toUpperCase();
                    if (process.env[envVariableName]) {
                        const setting = path.reduce((acc, val) => {
                            /* eslint-disable-line */ // @ts-ignore
                            acc[val] = acc[val] || {};
                            /* eslint-disable-line */ // @ts-ignore
                            return acc[val];
                        }, settings);
                        if (type.indexOf('object') >= 0 || type.indexOf('array') >= 0) {
                            try {
                                setting[key] = JSON.parse(process.env[envVariableName]);
                            }
                            catch (error) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                        else if (type.indexOf('number') >= 0) {
                            /* eslint-disable-line */ // @ts-ignore
                            setting[key] = process.env[envVariableName] * 1;
                        }
                        else if (type.indexOf('boolean') >= 0) {
                            setting[key] = process.env[envVariableName].toLowerCase() === 'true';
                        }
                        else {
                            /* istanbul ignore else */
                            if (type.indexOf('string') >= 0) {
                                setting[key] = process.env[envVariableName];
                            }
                        }
                    }
                }
                if (typeof obj[key] === 'object' && obj[key]) {
                    const newPath = [...path];
                    if (key !== 'properties' && key !== 'oneOf' && !Number.isInteger(Number(key))) {
                        newPath.push(key);
                    }
                    iterate(obj[key], newPath);
                }
            }
        });
    };
    iterate(settings_schema_json_1.default.properties, []);
}
function getInternalSettings() {
    if (!_settings) {
        _settings = read();
    }
    return _settings;
}
function get() {
    if (!_settingsWithDefaults) {
        loadSettingsWithDefaults();
    }
    return _settingsWithDefaults;
}
exports.get = get;
function set(path, value) {
    /* eslint-disable-next-line */
    let settings = getInternalSettings();
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            settings[key] = value;
        }
        else {
            if (!settings[key]) {
                settings[key] = {};
            }
            settings = settings[key];
        }
    }
    write();
}
exports.set = set;
function apply(newSettings) {
    ajvSetting(newSettings);
    const errors = ajvSetting.errors && ajvSetting.errors.filter((e) => e.keyword !== 'required');
    if (errors.length) {
        const error = errors[0];
        throw new Error(`${error.instancePath.substring(1)} ${error.message}`);
    }
    getInternalSettings(); // Ensure _settings is initialized.
    /* eslint-disable-line */ // @ts-ignore
    _settings = object_assign_deep_1.default.noMutate(_settings, newSettings);
    write();
    ajvRestartRequired(newSettings);
    const restartRequired = ajvRestartRequired.errors &&
        !!ajvRestartRequired.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
exports.apply = apply;
function getGroup(IDorName) {
    const settings = get();
    const byID = settings.groups[IDorName];
    if (byID) {
        return { devices: [], ...byID, ID: Number(IDorName) };
    }
    for (const [ID, group] of Object.entries(settings.groups)) {
        if (group.friendly_name === IDorName) {
            return { devices: [], ...group, ID: Number(ID) };
        }
    }
    return null;
}
exports.getGroup = getGroup;
function getGroups() {
    const settings = get();
    return Object.entries(settings.groups).map(([ID, group]) => {
        return { devices: [], ...group, ID: Number(ID) };
    });
}
exports.getGroups = getGroups;
function getGroupThrowIfNotExists(IDorName) {
    const group = getGroup(IDorName);
    if (!group) {
        throw new Error(`Group '${IDorName}' does not exist`);
    }
    return group;
}
function getDevice(IDorName) {
    const settings = get();
    const byID = settings.devices[IDorName];
    if (byID) {
        return { ...byID, ID: IDorName };
    }
    for (const [ID, device] of Object.entries(settings.devices)) {
        if (device.friendly_name === IDorName) {
            return { ...device, ID };
        }
    }
    return null;
}
exports.getDevice = getDevice;
function getDeviceThrowIfNotExists(IDorName) {
    const device = getDevice(IDorName);
    if (!device) {
        throw new Error(`Device '${IDorName}' does not exist`);
    }
    return device;
}
function addDevice(ID) {
    if (getDevice(ID)) {
        throw new Error(`Device '${ID}' already exists`);
    }
    const settings = getInternalSettings();
    if (!settings.devices) {
        settings.devices = {};
    }
    settings.devices[ID] = { friendly_name: ID };
    write();
    return getDevice(ID);
}
exports.addDevice = addDevice;
function addDeviceToPasslist(ID) {
    const settings = getInternalSettings();
    if (!settings.passlist) {
        settings.passlist = [];
    }
    if (settings.passlist.includes(ID)) {
        throw new Error(`Device '${ID}' already in passlist`);
    }
    settings.passlist.push(ID);
    write();
}
exports.addDeviceToPasslist = addDeviceToPasslist;
function blockDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }
    settings.blocklist.push(ID);
    write();
}
exports.blockDevice = blockDevice;
function removeDevice(IDorName) {
    const device = getDeviceThrowIfNotExists(IDorName);
    const settings = getInternalSettings();
    delete settings.devices[device.ID];
    // Remove device from groups
    if (settings.groups) {
        const regex = new RegExp(`^(${device.friendly_name}|${device.ID})(/(\\d|${utils_1.default.endpointNames.join('|')}))?$`);
        for (const group of Object.values(settings.groups).filter((g) => g.devices)) {
            group.devices = group.devices.filter((device) => !device.match(regex));
        }
    }
    write();
}
exports.removeDevice = removeDevice;
function addGroup(name, ID) {
    utils_1.default.validateFriendlyName(name, true);
    if (getGroup(name) || getDevice(name)) {
        throw new Error(`friendly_name '${name}' is already in use`);
    }
    const settings = getInternalSettings();
    if (!settings.groups) {
        settings.groups = {};
    }
    if (ID == null) {
        // look for free ID
        ID = '1';
        while (settings.groups.hasOwnProperty(ID)) {
            ID = (Number.parseInt(ID) + 1).toString();
        }
    }
    else {
        // ensure provided ID is not in use
        ID = ID.toString();
        if (settings.groups.hasOwnProperty(ID)) {
            throw new Error(`Group ID '${ID}' is already in use`);
        }
    }
    settings.groups[ID] = { friendly_name: name };
    write();
    return getGroup(ID);
}
exports.addGroup = addGroup;
function groupGetDevice(group, keys) {
    var _a;
    for (const device of (_a = group.devices) !== null && _a !== void 0 ? _a : []) {
        if (keys.includes(device))
            return device;
    }
    return null;
}
function addDeviceToGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!groupGetDevice(group, keys)) {
        if (!group.devices)
            group.devices = [];
        group.devices.push(keys[0]);
        write();
    }
}
exports.addDeviceToGroup = addDeviceToGroup;
function removeDeviceFromGroup(IDorName, keys) {
    const groupID = getGroupThrowIfNotExists(IDorName).ID;
    const settings = getInternalSettings();
    const group = settings.groups[groupID];
    if (!group.devices) {
        return;
    }
    const key = groupGetDevice(group, keys);
    if (key) {
        group.devices = group.devices.filter((d) => d != key);
        write();
    }
}
exports.removeDeviceFromGroup = removeDeviceFromGroup;
function removeGroup(IDorName) {
    const groupID = getGroupThrowIfNotExists(IDorName.toString()).ID;
    const settings = getInternalSettings();
    delete settings.groups[groupID];
    write();
}
exports.removeGroup = removeGroup;
function changeEntityOptions(IDorName, newOptions) {
    const settings = getInternalSettings();
    delete newOptions.friendly_name;
    delete newOptions.devices;
    let validator;
    if (getDevice(IDorName)) {
        (0, object_assign_deep_1.default)(settings.devices[getDevice(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.devices[getDevice(IDorName).ID]);
        validator = ajvRestartRequiredDeviceOptions;
    }
    else if (getGroup(IDorName)) {
        (0, object_assign_deep_1.default)(settings.groups[getGroup(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.groups[getGroup(IDorName).ID]);
        validator = ajvRestartRequiredGroupOptions;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
    validator(newOptions);
    const restartRequired = validator.errors && !!validator.errors.find((e) => e.keyword === 'requiresRestart');
    return restartRequired;
}
exports.changeEntityOptions = changeEntityOptions;
function changeFriendlyName(IDorName, newName) {
    utils_1.default.validateFriendlyName(newName, true);
    if (getGroup(newName) || getDevice(newName)) {
        throw new Error(`friendly_name '${newName}' is already in use`);
    }
    const settings = getInternalSettings();
    if (getDevice(IDorName)) {
        settings.devices[getDevice(IDorName).ID].friendly_name = newName;
    }
    else if (getGroup(IDorName)) {
        settings.groups[getGroup(IDorName).ID].friendly_name = newName;
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
}
exports.changeFriendlyName = changeFriendlyName;
function reRead() {
    _settings = null;
    getInternalSettings();
    _settingsWithDefaults = null;
    get();
}
exports.reRead = reRead;
exports.testing = {
    write,
    clear: () => {
        _settings = null;
        _settingsWithDefaults = null;
    },
    defaults,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUEsa0RBQTBCO0FBQzFCLG9EQUE0QjtBQUM1Qiw0RUFBa0Q7QUFDbEQsZ0RBQXdCO0FBQ3hCLGtEQUEwQjtBQUMxQiw4Q0FBMEM7QUFDMUMsa0ZBQWdEO0FBQ3JDLFFBQUEsTUFBTSxHQUFHLDhCQUFVLENBQUM7QUFDL0IsYUFBYTtBQUNiLGNBQU0sR0FBRyxFQUFFLENBQUM7QUFDWixJQUFBLDRCQUFnQixFQUFDLGNBQU0sRUFBRSw4QkFBVSxDQUFDLENBQUM7QUFFckMscUNBQXFDO0FBQ3JDO0lBQ0ksT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsNkJBQTZCLENBQUM7SUFDM0UsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsc0NBQXNDLENBQUM7SUFDcEYsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsNkJBQTZCLENBQUM7SUFDM0UsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsMEJBQTBCLENBQUM7SUFDeEUsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUM7SUFDaEUsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDO0lBQ3BELE9BQU8sY0FBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQztJQUN0RCxPQUFPLGNBQU0sQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7SUFDcEQsT0FBTyxjQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMscUJBQXFC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