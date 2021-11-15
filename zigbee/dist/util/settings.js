"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.testing = exports.reRead = exports.changeFriendlyName = exports.changeEntityOptions = exports.removeGroup = exports.removeDeviceFromGroup = exports.addDeviceToGroup = exports.addGroup = exports.removeDevice = exports.banDevice = exports.blockDevice = exports.whitelistDevice = exports.addDevice = exports.getDevice = exports.getGroups = exports.getGroup = exports.apply = exports.set = exports.get = exports.validate = exports.schema = void 0;
const data_1 = __importDefault(require("./data"));
const utils_1 = __importDefault(require("./utils"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const path_1 = __importDefault(require("path"));
const yaml_1 = __importDefault(require("./yaml"));
const ajv_1 = __importDefault(require("ajv"));
const settings_schema_json_1 = __importDefault(require("./settings.schema.json"));
exports.schema = settings_schema_json_1.default;
// DEPRECATED ZIGBEE2MQTT_CONFIG: https://github.com/Koenkk/zigbee2mqtt/issues/4697
const file = (_a = process.env.ZIGBEE2MQTT_CONFIG) !== null && _a !== void 0 ? _a : data_1.default.joinPath('configuration.yaml');
const ajvSetting = new ajv_1.default({ allErrors: true }).addKeyword('requiresRestart').compile(exports.schema);
const ajvRestartRequired = new ajv_1.default({ allErrors: true })
    .addKeyword({ keyword: 'requiresRestart', validate: (schema) => !schema }).compile(exports.schema);
const defaults = {
    passlist: [],
    blocklist: [],
    // Deprecated: use block/passlist
    whitelist: [],
    ban: [],
    permit_join: false,
    mqtt: {
        include_device_information: false,
        /**
         * Configurable force disable retain flag on mqtt publish.
         * https://github.com/Koenkk/zigbee2mqtt/pull/4948
         */
        force_disable_retain: false,
    },
    serial: {
        disable_led: false,
    },
    device_options: {},
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
    experimental: {
        // json or attribute or attribute_and_json
        output: 'json',
    },
    advanced: {
        legacy_api: true,
        log_rotation: true,
        log_symlink_current: false,
        log_output: ['console', 'file'],
        log_directory: path_1.default.join(data_1.default.getPath(), 'log', '%TIMESTAMP%'),
        log_file: 'log.txt',
        log_level: /* istanbul ignore next */ process.env.DEBUG ? 'debug' : 'info',
        log_syslog: {},
        soft_reset_timeout: 0,
        pan_id: 0x1a62,
        ext_pan_id: [0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD, 0xDD],
        channel: 11,
        adapter_concurrent: null,
        adapter_delay: null,
        // Availability timeout in seconds, disabled by default.
        availability_blocklist: [],
        availability_passlist: [],
        // Deprecated, use block/passlist
        availability_blacklist: [],
        availability_whitelist: [],
        /**
         * Home Assistant requires ALL attributes to be present in ALL MQTT messages send by the device.
         * https://community.home-assistant.io/t/missing-value-with-mqtt-only-last-data-set-is-shown/47070/9
         *
         * Therefore Zigbee2MQTT BY DEFAULT caches all values and resend it with every message.
         * advanced.cache_state in configuration.yaml allows to configure this.
         * https://www.zigbee2mqtt.io/configuration/configuration.html
         */
        cache_state: true,
        cache_state_persistent: true,
        cache_state_send_on_startup: true,
        /**
         * Add a last_seen attribute to mqtt messages, contains date/time of zigbee message arrival
         * "ISO_8601": ISO 8601 format
         * "ISO_8601_local": Local ISO 8601 format (instead of UTC-based)
         * "epoch": milliseconds elapsed since the UNIX epoch
         * "disable": no last_seen attribute (default)
         */
        last_seen: 'disable',
        // Optional: Add an elapsed attribute to MQTT messages, contains milliseconds since the previous msg
        elapsed: false,
        /**
         * https://github.com/Koenkk/zigbee2mqtt/issues/685#issuecomment-449112250
         *
         * Network key will serve as the encryption key of your network.
         * Changing this will require you to repair your devices.
         */
        network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 13],
        /**
         * Enables reporting feature
         */
        report: false,
        /**
         * Home Assistant discovery topic
         */
        homeassistant_discovery_topic: 'homeassistant',
        /**
         * Home Assistant status topic
         */
        homeassistant_status_topic: 'hass/status',
        /**
         * Home Assistant legacy entity attributes, when enabled:
         * Zigbee2MQTT will send additional states as attributes with each entity.
         * For example, A temperature & humidity sensor will have 2 entities for
         * the temperature and humidity, with this setting enabled both entities
         * will also have an temperature and humidity attribute.
         */
        homeassistant_legacy_entity_attributes: true,
        /**
         * Home Assistant legacy triggers, when enabled:
         * - Zigbee2mqt will send an empty 'action' or 'click' after one has been send
         * - A 'sensor_action' and 'sensor_click' will be discoverd
         */
        homeassistant_legacy_triggers: true,
        /**
         * Configurable timestampFormat
         * https://github.com/Koenkk/zigbee2mqtt/commit/44db557a0c83f419d66755d14e460cd78bd6204e
         */
        timestamp_format: 'YYYY-MM-DD HH:mm:ss',
    },
    ota: {
        /**
         * Minimal time delta in minutes between polling third party server for potential firmware updates
         */
        update_check_interval: 24 * 60,
        /**
         * Completely disallow Zigbee devices to initiate a search for a potential firmware update.
         * If set to true, only a user-initiated update search will be possible.
         */
        disable_automatic_update_check: false,
    },
    external_converters: [],
};
let _settings;
let _settingsWithDefaults;
function write() {
    const settings = getInternalSettings();
    const toWrite = (0, object_assign_deep_1.default)({}, settings);
    // Read settings to check if we have to split devices/groups into separate file.
    const actual = yaml_1.default.read(file);
    // In case the setting is defined in a separte file (e.g. !secret network_key) update it there.
    for (const path of [
        ['mqtt', 'user'],
        ['mqtt', 'password'],
        ['advanced', 'network_key'],
        ['frontend', 'auth_token'],
    ]) {
        if (actual[path[0]] && actual[path[0]][path[1]]) {
            const match = /!(.*) (.*)/g.exec(actual[path[0]][path[1]]);
            if (match) {
                yaml_1.default.updateIfChanged(data_1.default.joinPath(`${match[1]}.yaml`), match[2], toWrite[path[0]][path[1]]);
                toWrite[path[0]][path[1]] = actual[path[0]][path[1]];
            }
        }
    }
    // Write devices/groups to separate file if required.
    const writeDevicesOrGroups = (type) => {
        if (typeof actual[type] === 'string' || Array.isArray(actual[type])) {
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
    _settingsWithDefaults = (0, object_assign_deep_1.default)({}, defaults, getInternalSettings());
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
    const check = (name) => {
        if (names.includes(name))
            errors.push(`Duplicate friendly_name '${name}' found`);
        errors.push(...utils_1.default.validateFriendlyName(name));
        names.push(name);
    };
    const settingsWithDefaults = get();
    Object.values(settingsWithDefaults.devices).forEach((d) => check(d.friendly_name));
    Object.values(settingsWithDefaults.groups).forEach((g) => check(g.friendly_name));
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
    var _a, _b, _c, _d;
    const s = yaml_1.default.read(file);
    // Read !secret MQTT username and password if set
    // eslint-disable-next-line
    const interpetValue = (value) => {
        const re = /!(.*) (.*)/g;
        const match = re.exec(value);
        if (match) {
            const file = data_1.default.joinPath(`${match[1]}.yaml`);
            const key = match[2];
            return yaml_1.default.read(file)[key];
        }
        else {
            return value;
        }
    };
    if (((_a = s.mqtt) === null || _a === void 0 ? void 0 : _a.user) && ((_b = s.mqtt) === null || _b === void 0 ? void 0 : _b.password)) {
        s.mqtt.user = interpetValue(s.mqtt.user);
        s.mqtt.password = interpetValue(s.mqtt.password);
    }
    if ((_c = s.advanced) === null || _c === void 0 ? void 0 : _c.network_key) {
        s.advanced.network_key = interpetValue(s.advanced.network_key);
    }
    if ((_d = s.frontend) === null || _d === void 0 ? void 0 : _d.auth_token) {
        s.frontend.auth_token = interpetValue(s.frontend.auth_token);
    }
    // Read devices/groups configuration from separate file if specified.
    const readDevicesOrGroups = (type) => {
        if (typeof s[type] === 'string' || Array.isArray(s[type])) {
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
                            setting[key] = JSON.parse(process.env[envVariableName]);
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
                    if (key !== 'properties') {
                        newPath.push(key);
                    }
                    iterate(obj[key], newPath);
                }
            }
        });
    };
    iterate(exports.schema.properties, []);
}
function getInternalSettings() {
    if (!_settings) {
        _settings = read();
        applyEnvironmentVariables(_settings);
    }
    return _settings;
}
function get() {
    if (!_settingsWithDefaults) {
        _settingsWithDefaults = (0, object_assign_deep_1.default)({}, defaults, getInternalSettings());
    }
    if (!_settingsWithDefaults.devices) {
        _settingsWithDefaults.devices = {};
    }
    if (!_settingsWithDefaults.groups) {
        _settingsWithDefaults.groups = {};
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
    getInternalSettings(); // Ensure _settings is intialized.
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
function whitelistDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.whitelist) {
        settings.whitelist = [];
    }
    if (settings.whitelist.includes(ID)) {
        throw new Error(`Device '${ID}' already whitelisted`);
    }
    settings.whitelist.push(ID);
    write();
}
exports.whitelistDevice = whitelistDevice;
function blockDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.blocklist) {
        settings.blocklist = [];
    }
    settings.blocklist.push(ID);
    write();
}
exports.blockDevice = blockDevice;
function banDevice(ID) {
    const settings = getInternalSettings();
    if (!settings.ban) {
        settings.ban = [];
    }
    settings.ban.push(ID);
    write();
}
exports.banDevice = banDevice;
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
    if (getDevice(IDorName)) {
        (0, object_assign_deep_1.default)(settings.devices[getDevice(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.devices[getDevice(IDorName).ID]);
    }
    else if (getGroup(IDorName)) {
        (0, object_assign_deep_1.default)(settings.groups[getGroup(IDorName).ID], newOptions);
        utils_1.default.removeNullPropertiesFromObject(settings.groups[getGroup(IDorName).ID]);
    }
    else {
        throw new Error(`Device or group '${IDorName}' does not exist`);
    }
    write();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC9zZXR0aW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUEsa0RBQTBCO0FBQzFCLG9EQUE0QjtBQUM1Qiw0RUFBa0Q7QUFDbEQsZ0RBQXdCO0FBQ3hCLGtEQUEwQjtBQUMxQiw4Q0FBc0I7QUFDdEIsa0ZBQWdEO0FBQ25DLFFBQUEsTUFBTSxHQUFHLDhCQUFVLENBQUM7QUFFakMsbUZBQW1GO0FBQ25GLE1BQU0sSUFBSSxHQUFHLE1BQUEsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsbUNBQUksY0FBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ25GLE1BQU0sVUFBVSxHQUFHLElBQUksYUFBRyxDQUFDLEVBQUMsU0FBUyxFQUFFLElBQUksRUFBQyxDQUFDLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLENBQUMsT0FBTyxDQUFDLGNBQU0sQ0FBQyxDQUFDO0FBQzVGLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxhQUFHLENBQUMsRUFBQyxTQUFTLEVBQUUsSUFBSSxFQUFDLENBQUM7S0FDaEQsVUFBVSxDQUFDLEVBQUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxDQUFDLE1BQWUsRUFBRSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFNLENBQUMsQ0FBQztBQUV0RyxNQUFNLFFBQVEsR0FBK0I7SUFDekMsUUFBUSxFQUFFLEVBQUU7SUFDWixTQUFTLEVBQUUsRUFBRTtJQUNiLGlDQUFpQztJQUNqQyxTQUFTLEVBQUUsRUFBRTtJQUNiLEdBQUcsRUFBRSxFQUFFO0lBQ1AsV0FBVyxFQUFFLEtBQUs7SUFDbEIsSUFBSSxFQUFFO1FBQ0YsMEJBQTBCLEVBQUUsS0FBSztRQUNqQzs7O1dBR0c7UUFDSCxvQkFBb0IsRUFBRSxLQUFLO0tBQzlCO0lBQ0QsTUFBTSxFQUFF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