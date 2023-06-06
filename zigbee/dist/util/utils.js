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
const es6_1 = __importDefault(require("fast-deep-equal/es6"));
const humanize_duration_1 = __importDefault(require("humanize-duration"));
const data_1 = __importDefault(require("./data"));
const vm_1 = __importDefault(require("vm"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const deep_object_diff_1 = require("deep-object-diff");
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date) {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = (num) => {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };
    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        plusOrMinus + pad(tzOffset / 60) +
        ':' + pad(tzOffset % 60);
}
const endpointNames = [
    'left', 'right', 'center', 'bottom_left', 'bottom_right', 'default',
    'top_left', 'top_right', 'white', 'rgb', 'cct', 'system', 'top', 'bottom', 'center_left', 'center_right',
    'ep1', 'ep2', 'row_1', 'row_2', 'row_3', 'row_4', 'relay', 'usb',
    'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8',
    'l9', 'l10', 'l11', 'l12', 'l13', 'l14', 'l15', 'l16',
    'button_1', 'button_2', 'button_3', 'button_4', 'button_5',
    'button_6', 'button_7', 'button_8', 'button_9', 'button_10',
    'button_11', 'button_12', 'button_13', 'button_14', 'button_15',
    'button_16', 'button_17', 'button_18', 'button_19', 'button_20',
    'button_light', 'button_fan_high', 'button_fan_med', 'button_fan_low',
    'heat', 'cool', 'water', 'meter', 'wifi', 'no_occupancy_since',
];
function capitalize(s) {
    return s[0].toUpperCase() + s.slice(1);
}
async function getZigbee2MQTTVersion(includeCommitHash = true) {
    const git = await Promise.resolve().then(() => __importStar(require('git-last-commit')));
    const packageJSON = await Promise.resolve(`${'../..' + '/package.json'}`).then(s => __importStar(require(s)));
    if (!includeCommitHash) {
        return { version: packageJSON.version, commitHash: null };
    }
    return new Promise((resolve) => {
        const version = packageJSON.version;
        git.getLastCommit((err, commit) => {
            let commitHash = null;
            if (err) {
                try {
                    commitHash = fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'dist', '.hash'), 'utf-8');
                }
                catch (error) {
                    /* istanbul ignore next */
                    commitHash = 'unknown';
                }
            }
            else {
                commitHash = commit.shortHash;
            }
            commitHash = commitHash.trim();
            resolve({ commitHash, version });
        });
    });
}
async function getDependencyVersion(depend) {
    const packageJSON = await Promise.resolve(`${path_1.default.join(require.resolve(depend), '..', '..', 'package.json')}`).then(s => __importStar(require(s)));
    const version = packageJSON.version;
    return { version };
}
function formatDate(time, type) {
    if (type === 'ISO_8601')
        return new Date(time).toISOString();
    else if (type === 'ISO_8601_local')
        return toLocalISOString(new Date(time));
    else if (type === 'epoch')
        return time;
    else { // relative
        return (0, humanize_duration_1.default)(Date.now() - time, { language: 'en', largest: 2, round: true }) + ' ago';
    }
}
function objectHasProperties(object, properties) {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }
    return true;
}
function equalsPartial(object, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (!(0, es6_1.default)(object[key], value)) {
            return false;
        }
    }
    return true;
}
function getObjectProperty(object, key, defaultValue) {
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
}
function getResponse(request, data, error) {
    const response = { data, status: error ? 'error' : 'ok' };
    if (error)
        response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}
function parseJSON(value, fallback) {
    try {
        return JSON.parse(value);
    }
    catch (e) {
        return fallback;
    }
}
function loadModuleFromText(moduleCode, name) {
    const moduleFakePath = path_1.default.join(__dirname, '..', '..', 'data', 'extension', name || 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm_1.default.runInNewContext(moduleCode, sandbox, moduleFakePath);
    /* eslint-disable-line */ // @ts-ignore
    return sandbox.module.exports;
}
function loadModuleFromFile(modulePath) {
    const moduleCode = fs_1.default.readFileSync(modulePath, { encoding: 'utf8' });
    return loadModuleFromText(moduleCode);
}
function* getExternalConvertersDefinitions(settings) {
    const externalConverters = settings.external_converters;
    for (const moduleName of externalConverters) {
        let converter;
        if (moduleName.endsWith('.js')) {
            converter = loadModuleFromFile(data_1.default.joinPath(moduleName));
        }
        else {
            converter = require(moduleName);
        }
        if (Array.isArray(converter)) {
            for (const item of converter) {
                yield item;
            }
        }
        else {
            yield converter;
        }
    }
}
function removeNullPropertiesFromObject(obj) {
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        }
        else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value);
        }
    }
}
function toNetworkAddressHex(value) {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}
// eslint-disable-next-line
function toSnakeCase(value) {
    if (typeof value === 'object') {
        value = { ...value };
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    }
    else {
        return value.replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase()).replace(/^_/, '').replace('_i_d', '_id');
    }
}
function charRange(start, stop) {
    const result = [];
    for (let idx = start.charCodeAt(0), end = stop.charCodeAt(0); idx <= end; ++idx) {
        result.push(idx);
    }
    return result;
}
const controlCharacters = [
    ...charRange('\u0000', '\u001F'),
    ...charRange('\u007f', '\u009F'),
    ...charRange('\ufdd0', '\ufdef'),
];
function containsControlCharacter(str) {
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        if (controlCharacters.includes(ch) || [0xFFFE, 0xFFFF].includes(ch & 0xFFFF)) {
            return true;
        }
    }
    return false;
}
function getAllFiles(path_) {
    const result = [];
    for (let item of fs_1.default.readdirSync(path_)) {
        item = path_1.default.join(path_, item);
        if (fs_1.default.lstatSync(item).isFile()) {
            result.push(item);
        }
        else {
            result.push(...getAllFiles(item));
        }
    }
    return result;
}
function validateFriendlyName(name, throwFirstError = false) {
    const errors = [];
    for (const endpointName of endpointNames) {
        if (name.toLowerCase().endsWith('/' + endpointName)) {
            errors.push(`friendly_name is not allowed to end with: '/${endpointName}'`);
        }
    }
    if (name.length === 0)
        errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/'))
        errors.push(`friendly_name is not allowed to end or start with /`);
    if (containsControlCharacter(name))
        errors.push(`friendly_name is not allowed to contain control char`);
    if (endpointNames.includes(name))
        errors.push(`Following friendly_name are not allowed: '${endpointNames}'`);
    if (name.match(/.*\/\d*$/))
        errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }
    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }
    return errors;
}
function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
function sanitizeImageParameter(parameter) {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}
function isAvailabilityEnabledForEntity(entity, settings) {
    if (entity.isGroup()) {
        return !entity.membersDevices().map((d) => isAvailabilityEnabledForEntity(d, settings)).includes(false);
    }
    if (entity.options.hasOwnProperty('availability')) {
        return !!entity.options.availability;
    }
    // availability_timeout = deprecated
    const enabledGlobal = settings.advanced.availability_timeout || settings.availability;
    if (!enabledGlobal)
        return false;
    if (entity.isDevice() && entity.options.disabled)
        return false;
    const passlist = settings.advanced.availability_passlist.concat(settings.advanced.availability_whitelist);
    if (passlist.length > 0) {
        return passlist.includes(entity.name) || passlist.includes(entity.ieeeAddr);
    }
    const blocklist = settings.advanced.availability_blacklist.concat(settings.advanced.availability_blocklist);
    return !blocklist.includes(entity.name) && !blocklist.includes(entity.ieeeAddr);
}
const entityIDRegex = new RegExp(`^(.+?)(?:/(${endpointNames.join('|')}|\\d+))?$`);
function parseEntityID(ID) {
    const match = ID.match(entityIDRegex);
    return match && { ID: match[1], endpoint: match[2] };
}
function isEndpoint(obj) {
    return obj.constructor.name.toLowerCase() === 'endpoint';
}
function flatten(arr) {
    return [].concat(...arr);
}
function arrayUnique(arr) {
    return [...new Set(arr)];
}
function isZHGroup(obj) {
    return obj.constructor.name.toLowerCase() === 'group';
}
function availabilityPayload(state, settings) {
    return settings.advanced.legacy_availability_payload ? state : JSON.stringify({ state });
}
const hours = (hours) => 1000 * 60 * 60 * hours;
const minutes = (minutes) => 1000 * 60 * minutes;
const seconds = (seconds) => 1000 * seconds;
function publishLastSeen(data, settings, allowMessageEmitted, publishEntityState) {
    /**
     * Prevent 2 MQTT publishes when 1 message event is received;
     * - In case reason == messageEmitted, receive.ts will only call this when it did not publish a
     *      message based on the received zigbee message. In this case allowMessageEmitted has to be true.
     * - In case reason !== messageEmitted, controller.ts will call this based on the zigbee-herdsman
     *      lastSeenChanged event.
     */
    const allow = data.reason !== 'messageEmitted' || (data.reason === 'messageEmitted' && allowMessageEmitted);
    if (settings.advanced.last_seen && settings.advanced.last_seen !== 'disable' && allow) {
        publishEntityState(data.device, {}, 'lastSeenChanged');
    }
}
function filterProperties(filter, data) {
    if (filter) {
        for (const property of Object.keys(data)) {
            if (filter.find((p) => property.match(`^${p}$`))) {
                delete data[property];
            }
        }
    }
}
function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
function computeSettingsToChange(current, new_) {
    const diff = (0, deep_object_diff_1.detailedDiff)(current, new_);
    // Remove any settings that are in the deleted.diff but not in the passed options
    const cleanupDeleted = (options, deleted) => {
        for (const key of Object.keys(deleted)) {
            if (!(key in options)) {
                delete deleted[key];
            }
            else if (!Array.isArray(options[key])) {
                cleanupDeleted(options[key], deleted[key]);
            }
        }
    };
    cleanupDeleted(new_, diff.deleted);
    // objectAssignDeep requires object prototype which is missing from detailedDiff, therefore clone
    const newSettings = (0, object_assign_deep_1.default)({}, clone(diff.added), clone(diff.updated), clone(diff.deleted));
    // deep-object-diff converts arrays to objects, set original array back here
    const convertBackArray = (before, after) => {
        for (const [key, afterValue] of Object.entries(after)) {
            const beforeValue = before[key];
            if (Array.isArray(beforeValue)) {
                after[key] = beforeValue;
            }
            else if (afterValue && typeof beforeValue === 'object') {
                convertBackArray(beforeValue, afterValue);
            }
        }
    };
    convertBackArray(new_, newSettings);
    return newSettings;
}
exports.default = {
    endpointNames, capitalize, getZigbee2MQTTVersion, getDependencyVersion, formatDate, objectHasProperties,
    equalsPartial, getObjectProperty, getResponse, parseJSON, loadModuleFromText, loadModuleFromFile,
    getExternalConvertersDefinitions, removeNullPropertiesFromObject, toNetworkAddressHex, toSnakeCase,
    parseEntityID, isEndpoint, isZHGroup, hours, minutes, seconds, validateFriendlyName, sleep,
    sanitizeImageParameter, isAvailabilityEnabledForEntity, publishLastSeen, availabilityPayload,
    getAllFiles, filterProperties, flatten, arrayUnique, clone, computeSettingsToChange,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9saWIvdXRpbC91dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOERBQXlDO0FBQ3pDLDBFQUFpRDtBQUNqRCxrREFBMEI7QUFDMUIsNENBQW9CO0FBQ3BCLDRDQUFvQjtBQUNwQixnREFBd0I7QUFDeEIsdURBQThDO0FBQzlDLDRFQUFrRDtBQUVsRCwwREFBMEQ7QUFDMUQsV0FBVztBQUNYLGtEQUFrRDtBQUNsRCx5RUFBeUU7QUFDekUsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFVO0lBQ2hDLE1BQU0sUUFBUSxHQUFHLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7SUFDM0MsTUFBTSxXQUFXLEdBQUcsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7SUFDOUMsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRTtRQUNoQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2QyxPQUFPLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDekMsQ0FBQyxDQUFDO0lBRUYsT0FBTyxJQUFJLENBQUMsV0FBVyxFQUFFO1FBQ3JCLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUM5QixHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN6QixHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMxQixHQUFHLEdBQUcsR0FBRyxDQUFDLElB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