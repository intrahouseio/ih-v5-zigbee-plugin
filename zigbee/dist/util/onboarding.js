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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboard = onboard;
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const node_querystring_1 = require("node:querystring");
const adapterDiscovery_1 = require("zigbee-herdsman/dist/adapter/adapterDiscovery");
const data_1 = __importDefault(require("./data"));
const settings = __importStar(require("./settings"));
const yaml_1 = require("./yaml");
function escapeHtml(s) {
    return s.replace(/[^0-9A-Za-z \-_.]/g, (c) => `&#${c.charCodeAt(0)};`);
}
function generateHtmlDone(frontendUrl) {
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT Onboarding</h1>
        <p>Settings saved.</p>
        <p>Zigbee2MQTT is now starting...</p>
        <small>${frontendUrl ? `Redirecting to Zigbee2MQTT frontend at <a href="${frontendUrl}">${frontendUrl}</a> in 30 seconds.` : "You can close this page."}</small>
    </main>
    ${frontendUrl ? `<script>setTimeout(() => { window.location.replace("${frontendUrl}"); }, 30000);</script>` : ""}
</body>
</html>
`;
}
function generateHtmlForm(currentSettings, devices) {
    let devicesSelect = "";
    if (devices.length > 0) {
        devicesSelect += '<select id="found_device" onchange="setFoundDevice(this)">';
        devicesSelect += '<option value="">Select a device</option>';
        for (const device of devices) {
            // just in case name has commas, remove them to not mess with `split` logic
            const deviceStr = `${device.name.replaceAll(",", "")}, ${device.path}, ${device.adapter ?? "unknown"}`;
            devicesSelect += `<option value="${deviceStr}">${deviceStr}</option>`;
        }
        devicesSelect += "</select>";
        devicesSelect += "<small>Optionally allows to configure coordinator port and type (if known) automatically.</small>";
    }
    else {
        devicesSelect = "<small>No device found</small>";
    }
    let generateCheckbox = "";
    if (Array.isArray(currentSettings.advanced?.network_key) ||
        typeof currentSettings.advanced?.pan_id === "number" ||
        Array.isArray(currentSettings.advanced?.ext_pan_id)) {
        generateCheckbox = `
<label for="generate_network">
    <input
        type="checkbox"
        id="generate_network"
        onclick="setGenerate(this)"
        ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY || process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID || process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID ? "disabled" : ""}>
    Generate network?
</label>
`;
    }
    /* v8 ignore start */
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT Onboarding</h1>
        <p>Set the base configuration to start Zigbee2MQTT.</p>
        <p>Optional fields will either be ignored or fallback to defaults if not set (see appropriate documentation page for more details).</p>
        <p>If a field is disabled, it means <a href="https://www.zigbee2mqtt.io/guide/configuration/#environment-variables" target="_blank">environment variables</a> are being used to override specific values (for example, through the Home Assistant add-on configuration page).</p>
        <hr>
        <form method="post">
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL || process.env.ZIGBEE2MQTT_CONFIG_SERIAL_PORT || process.env.ZIGBEE2MQTT_CONFIG_SERIAL_ADAPTER ? "disabled" : ""}>
                <label for="found_device">Found Devices</label>
                ${devicesSelect}
            </fieldset>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL ? "disabled" : ""}>
                <label for="serial_port">Coordinator/Adapter Port/Path</label>
                <input
                    type="text"
                    id="serial_port"
                    name="serial_port"
                    value="${currentSettings.serial?.port ?? ""}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_PORT ? "disabled" : ""}>
                <label for="serial_adapter">Coordinator/Adapter Type/Stack/Driver</label>
                <select id="serial_adapter" name="serial_adapter" required ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_ADAPTER ? "disabled" : ""}>
                    <option value="zstack" ${currentSettings.serial?.adapter === "zstack" ? "selected" : ""}>zstack</option>
                    <option value="ember" ${currentSettings.serial?.adapter === "ember" ? "selected" : ""}>ember</option>
                    <option value="deconz" ${currentSettings.serial?.adapter === "deconz" ? "selected" : ""}>deconz</option>
                    <option value="zigate" ${currentSettings.serial?.adapter === "zigate" ? "selected" : ""}>zigate</option>
                    <option value="zboss" ${currentSettings.serial?.adapter === "zboss" ? "selected" : ""}>zboss</option>
                </select>
                <label for="serial_baudrate">Coordinator/Adapter Baudrate</label>
                <select id="serial_baudrate" name="serial_baudrate" ${process.env.ZIGBEE2MQTT_CONFIG_SERIAL_BAUDRATE ? "disabled" : ""}>
                    <option value="38400" ${currentSettings.serial?.baudrate === 38400 ? "selected" : ""}>38400</option>
                    <option value="57600" ${currentSettings.serial?.baudrate === 57600 ? "selected" : ""}>57600</option>
                    <option value="115200" ${!currentSettings.serial?.baudrate || currentSettings.serial?.baudrate === 115200 ? "selected" : ""}>115200</option>
                    <option value="230400" ${currentSettings.serial?.baudrate === 230400 ? "selected" : ""}>230400</option>
                    <option value="460800" ${currentSettings.serial?.baudrate === 460800 ? "selected" : ""}>460800</option>
                    <option value="921600" ${currentSettings.serial?.baudrate === 921600 ? "selected" : ""}>921600</option>
                </select>
                <small>Can be ignored for networked coordinators (TCP).</small>
                <label for="serial_rtscts">Coordinator/Adapter Hardware Flow Control ("rtscts: true")</label>
                <input
                    type="checkbox"
                    id="serial_rtscts"
                    name="serial_rtscts"
                    ${currentSettings.serial?.rtscts ? "checked" : ""}
                    style="margin-bottom: 1rem;">
                <small>Can be ignored for networked coordinators (TCP).</small>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/adapter-settings.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/adapter-settings.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                <label for="closest_wifi_channel">Closest WiFi Channel</label>
                <input
                    type="number"
                    min="0"
                    max="14"
                    id="closest_wifi_channel"
                    value="0"
                    onclick="setBestZigbeeChannel(this)"
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL ? "disabled" : ""}>
                <small>Optionally set to your closest WiFi channel to pick the best value for "Network channel" below.</small>
                <label for="network_channel">Network Channel</label>
                <input
                    type="number"
                    min="11"
                    max="26"
                    id="network_channel"
                    name="network_channel"
                    value="${currentSettings.advanced?.channel ?? "25"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_CHANNEL ? "disabled" : ""}>
            </fieldset>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                ${generateCheckbox}
                <label for="network_key">Network Key</label>
                <input
                    type="text"
                    id="network_key"
                    name="network_key"
                    value="${currentSettings.advanced?.network_key ?? "GENERATE"}"
                    pattern="^([0-9]+(,[0-9]+){15})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_NETWORK_KEY ? "disabled" : ""}>
                <label for="network_pan_id">Network PAN ID</label>
                <input
                    type="text"
                    id="network_pan_id"
                    name="network_pan_id"
                    value="${currentSettings.advanced?.pan_id ?? "GENERATE"}"
                    pattern="^([0-9]{1,5})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_PAN_ID ? "disabled" : ""}>
                <label for="network_ext_pan_id">Network Extended PAN ID</label>
                <input
                    type="text"
                    id="network_ext_pan_id"
                    name="network_ext_pan_id"
                    value="${currentSettings.advanced?.ext_pan_id ?? "GENERATE"}"
                    pattern="^([0-9]+(,[0-9]+){7})|GENERATE$"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_EXT_PAN_ID ? "disabled" : ""}>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/zigbee-network.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/zigbee-network.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_MQTT ? "disabled" : ""}>
                <label for="mqtt_base_topic">MQTT Base Topic</label>
                <input
                    type="text"
                    id="mqtt_base_topic"
                    name="mqtt_base_topic"
                    value="${currentSettings.mqtt?.base_topic ?? "zigbee2mqtt"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_BASE_TOPIC ? "disabled" : ""}>
                <label for="mqtt_server">MQTT Server</label>
                <input
                    type="text"
                    id="mqtt_server"
                    name="mqtt_server"
                    value="${currentSettings.mqtt?.server ?? "mqtt://localhost:1883"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_SERVER ? "disabled" : ""}>
                <label for="mqtt_user">MQTT User</label>
                <input
                    type="text"
                    id="mqtt_user"
                    name="mqtt_user"
                    value="${currentSettings.mqtt?.user ?? ""}"
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_USER ? "disabled" : ""}>
                <small>Optional. Set only if using authentication.</small>
                <label for="mqtt_password">MQTT Password</label>
                <input
                    type="password"
                    id="mqtt_password"
                    name="mqtt_password"
                    value="${currentSettings.mqtt?.password ?? ""}"
                    ${process.env.ZIGBEE2MQTT_CONFIG_MQTT_PASSWORD ? "disabled" : ""}>
                <small>Optional. Set only if using authentication.</small>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/mqtt.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/mqtt.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND ? "disabled" : ""}>
                <label for="frontend_enabled">
                    <input
                        type="checkbox"
                        id="frontend_enabled"
                        name="frontend_enabled"
                        ${currentSettings.frontend?.enabled ? "checked" : ""}
                        ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_ENABLED ? "disabled" : ""}>
                    Frontend enabled?
                </label>
                <label for="frontend_port">Frontend Port</label>
                <input
                    type="number"
                    min="0"
                    max="65535"
                    id="frontend_port"
                    name="frontend_port"
                    value="${currentSettings.frontend?.port ?? "8080"}"
                    required
                    ${process.env.ZIGBEE2MQTT_CONFIG_FRONTEND_PORT ? "disabled" : ""}>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/frontend.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/frontend.html</a>
            </small>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT ? "disabled" : ""}>
                <label for="homeassistant_enabled" ${process.env.ZIGBEE2MQTT_CONFIG_HOMEASSISTANT_ENABLED ? "disabled" : ""}>
                    <input type="checkbox" id="homeassistant_enabled" name="homeassistant_enabled" ${currentSettings.homeassistant?.enabled ? "checked" : ""}>
                    Home Assistant enabled?
                </label>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/homeassistant.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/homeassistant.html</a>
            </small>
            <hr>
            <fieldset ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED ? "disabled" : ""}>
                <label for="log_level">Log Level</label>
                <select id="log_level" name="log_level" ${process.env.ZIGBEE2MQTT_CONFIG_ADVANCED_LOG_LEVEL ? "disabled" : ""}>
                    <option value="error" ${currentSettings.advanced?.log_level === "error" ? "selected" : ""}>error</option>
                    <option value="warning" ${currentSettings.advanced?.log_level === "warning" ? "selected" : ""}>warning</option>
                    <option value="info" ${!currentSettings.advanced?.log_level || currentSettings.advanced?.log_level === "info" ? "selected" : ""}>info</option>
                    <option value="debug" ${currentSettings.advanced?.log_level === "debug" ? "selected" : ""}>debug</option>
                </select>
            </fieldset>
            <small>
                <a href="https://www.zigbee2mqtt.io/guide/configuration/logging.html" target="_blank">https://www.zigbee2mqtt.io/guide/configuration/logging.html</a>
            </small>
            <hr>
            <input type="submit" value="Submit">
        </form>
    </main>
    <script>
        function setFoundDevice(e) {
            if (!e.value) {
                return;
            }

            const [, path, adapter] = e.value.split(", ");
            const serialPortEl = document.querySelector("#serial_port");
            serialPortEl.value = path;
            const serialAdapterEl = document.querySelector("#serial_adapter");

            if (['zstack', 'ember', 'deconz', 'zigate', 'zboss'].includes(adapter)) {
                serialAdapterEl.value = adapter;
            } else {
                serialAdapterEl.value = '';
            }
        }

        function setBestZigbeeChannel(e) {
            const wifiChannel = parseInt(e.value, 10);
            const networkChannelEl = document.querySelector("#network_channel");

            if (wifiChannel >= 11) {
                // WiFi 11-14
                networkChannelEl.value = 15;
            } else if (wifiChannel >= 6) {
                // WiFi 6-10
                networkChannelEl.value = 11;
            } else {
                // WiFi 1-5
                networkChannelEl.value = 25;
            }
        }

        function setGenerate(e) {
            document.querySelector("#network_key").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.network_key ?? "GENERATE"}";
            document.querySelector("#network_pan_id").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.pan_id ?? "GENERATE"}";
            document.querySelector("#network_ext_pan_id").value = e.checked ? "GENERATE" : "${currentSettings.advanced?.ext_pan_id ?? "GENERATE"}";
        }
    </script>
</body>
</html>
`;
    /* v8 ignore stop */
}
function generateHtmlError(errors) {
    return `
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zigbee2MQTT Onboarding</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.classless.min.css">
</head>
<body>
    <main>
        <h1>Zigbee2MQTT configuration is not valid</h1>
        <p style="color: #F00;">Found the following errors:</p>
        ${errors}
        <hr>
        <p>If you don't know how to solve this, read <a href="https://www.zigbee2mqtt.io/guide/configuration" target="_blank">https://www.zigbee2mqtt.io/guide/configuration</a></p>
        <form method="post" action="/">
            <input type="submit" value="Close">
        </form>
    </main>
</body>
</html>
`;
}
function getServerUrl() {
    return new URL(process.env.Z2M_ONBOARD_URL ?? "http://0.0.0.0:8080");
}
async function startOnboardingServer() {
    const currentSettings = settings.get();
    const serverUrl = getServerUrl();
    let server;
    let failed = false;
    const success = await new Promise((resolve) => {
        server = (0, node_http_1.createServer)(async (req, res) => {
            if (req.method === "POST") {
                if (failed) {
                    res.end(() => {
                        resolve(false);
                    });
                }
                else {
                    let body = "";
                    req.on("data", (chunk) => {
                        body += chunk;
                    });
                    req.on("end", () => {
                        const result = (0, node_querystring_1.parse)(body);
                        const frontendEnabled = result.frontend_enabled === "on";
                        const updatedSettings = {
                            mqtt: {
                                base_topic: result.mqtt_base_topic,
                                server: result.mqtt_server,
                                user: result.mqtt_user || undefined, // empty string => removed
                                password: result.mqtt_password || undefined, // empty string => removed
                            },
                            serial: {
                                port: result.serial_port,
                                adapter: result.serial_adapter,
                                baudrate: result.serial_baudrate ? Number.parseInt(result.serial_baudrate, 10) : undefined,
                                rtscts: result.serial_rtscts === "on",
                            },
                            advanced: {
                                log_level: result.log_level,
                                channel: result.network_channel ? Number.parseInt(result.network_channel, 10) : undefined,
                                network_key: result.network_key
                                    ? result.network_key === "GENERATE"
                                        ? result.network_key
                                        : result.network_key.split(",").map((v) => Number.parseInt(v, 10))
                                    : undefined,
                                pan_id: result.network_pan_id
                                    ? result.network_pan_id === "GENERATE"
                                        ? result.network_pan_id
                                        : Number.parseInt(result.network_pan_id, 10)
                                    : undefined,
                                ext_pan_id: result.network_ext_pan_id
                                    ? result.network_ext_pan_id === "GENERATE"
                                        ? result.network_ext_pan_id
                                        : result.network_ext_pan_id.split(",").map((v) => Number.parseInt(v, 10))
                                    : undefined,
                            },
                            frontend: {
                                enabled: frontendEnabled,
                                port: result.frontend_port ? Number.parseInt(result.frontend_port, 10) : undefined,
                            },
                            homeassistant: {
                                enabled: result.homeassistant_enabled === "on",
                            },
                        };
                        try {
                            settings.apply(updatedSettings);
                            // to redirect, make sure frontend "will be" enabled, and host isn't socket
                            const redirect = !process.env.Z2M_ONBOARD_NO_REDIRECT &&
                                frontendEnabled &&
                                (!currentSettings.frontend?.host || !currentSettings.frontend.host.startsWith("/"));
                            const protocol = currentSettings.frontend?.ssl_cert && currentSettings.frontend.ssl_key ? "https" : "http";
                            res.setHeader("Content-Type", "text/html");
                            res.writeHead(200);
                            res.end(generateHtmlDone(redirect
                                ? /* v8 ignore next */ `${protocol}://${currentSettings.frontend?.host ?? "localhost"}:${currentSettings.frontend?.port ?? "8080"}${currentSettings.frontend?.base_url ?? "/"}`
                                : undefined), () => {
                                resolve(true);
                            });
                        }
                        catch (error) {
                            console.error(`Failed to apply configuration: ${error.message}`);
                            failed = true;
                            if (process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
                                res.end(() => {
                                    resolve(false);
                                });
                            }
                            else {
                                res.setHeader("Content-Type", "text/html");
                                res.writeHead(406);
                                res.end(generateHtmlError(`<p>${escapeHtml(error.message)}</p>`));
                            }
                        }
                    });
                }
            }
            else {
                res.setHeader("Content-Type", "text/html");
                res.writeHead(200);
                res.end(generateHtmlForm(currentSettings, await (0, adapterDiscovery_1.findAllDevices)()));
            }
        });
        server.listen(Number.parseInt(serverUrl.port), serverUrl.hostname, () => {
            console.log(`Onboarding page is available at ${serverUrl.href}`);
        });
    });
    await new Promise((resolve) => server?.close(resolve));
    return success;
}
async function startFailureServer(errors) {
    const serverUrl = getServerUrl();
    let server;
    await new Promise((resolve) => {
        server = (0, node_http_1.createServer)((req, res) => {
            if (req.method === "POST") {
                res.end(() => {
                    resolve();
                });
            }
            else {
                res.setHeader("Content-Type", "text/html");
                res.writeHead(406);
                res.end(generateHtmlError(errors));
            }
        });
        server.listen(Number.parseInt(serverUrl.port), serverUrl.hostname, () => {
            console.error(`Failure page is available at ${serverUrl.href}`);
        });
    });
    await new Promise((resolve) => server?.close(resolve));
}
async function onSettingsErrors(errors) {
    let pErrors = "";
    console.error("\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("            READ THIS CAREFULLY\n");
    console.error("Refusing to start because configuration is not valid, found the following errors:");
    for (const error of errors) {
        console.error(`- ${error}`);
        pErrors += `<p>- ${escapeHtml(error)}</p>`;
    }
    console.error("\nIf you don't know how to solve this, read https://www.zigbee2mqtt.io/guide/configuration");
    console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n");
    if (!process.env.Z2M_ONBOARD_NO_SERVER && !process.env.Z2M_ONBOARD_NO_FAILURE_PAGE) {
        await startFailureServer(pErrors);
    }
}
async function onboard() {
    if (!(0, node_fs_1.existsSync)(data_1.default.getPath())) {
        (0, node_fs_1.mkdirSync)(data_1.default.getPath(), { recursive: true });
    }
    const confExists = (0, node_fs_1.existsSync)(data_1.default.joinPath("configuration.yaml"));
    if (confExists) {
        // initial caching, ensure file is valid yaml first
        try {
            settings.getPersistedSettings();
        }
        catch (error) {
            await onSettingsErrors(error instanceof yaml_1.YAMLFileException
                ? [`Your configuration file: '${error.file}' is invalid (use https://jsonformatter.org/yaml-validator to find and fix the issue)`]
                : [`${error}`]);
            return false;
        }
        // migrate first
        const { migrateIfNecessary } = await import("./settingsMigration.js");
        migrateIfNecessary();
        // make sure existing settings are valid before applying envs
        const errors = settings.validateNonRequired();
        if (errors.length > 0) {
            await onSettingsErrors(errors);
            return false;
        }
        // trigger initial writing of `ZIGBEE2MQTT_CONFIG_*` ENVs
        settings.write();
    }
    else {
        settings.writeMinimalDefaults();
    }
    // use `configuration.yaml` file to detect "brand new install"
    // env allows to re-run onboard even with existing install
    if (!process.env.Z2M_ONBOARD_NO_SERVER && (process.env.Z2M_ONBOARD_FORCE_RUN || !confExists || settings.get().onboarding)) {
        settings.setOnboarding(true);
        const success = await startOnboardingServer();
        if (!success) {
            return false;
        }
    }
    settings.reRead();
    const errors = settings.validate();
    if (errors.length > 0) {
        await onSettingsErrors(errors);
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25ib2FyZGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi91dGlsL29uYm9hcmRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE0aEJBLDBCQWdFQztBQTVsQkQscUNBQThDO0FBQzlDLHlDQUF1QztBQUN2Qyx1REFBdUM7QUFDdkMsb0ZBQTZFO0FBQzdFLGtEQUEwQjtBQUMxQixxREFBdUM7QUFDdkMsaUNBQXlDO0FBcUJ6QyxTQUFTLFVBQVUsQ0FBQyxDQUFTO0lBQ3pCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUMzRSxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxXQUErQjtJQUNyRCxPQUFPOzs7Ozs7Ozs7Ozs7OztpQkFjTSxXQUFXLENBQUMsQ0FBQyxDQUFDLG1EQUFtRCxXQUFXLEtBQUssV0FBVyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsMEJBQTBCOztNQUV6SixXQUFXLENBQUMsQ0FBQyxDQUFDLHVEQUF1RCxXQUFXLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxFQUFFOzs7Q0FHbkgsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLGVBQTJDLEVBQUUsT0FBbUQ7SUFDdEgsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO0lBRXZCLElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUNyQixhQUFhLElBQUksNERBQTRELENBQUM7UUFDOUUsYUFBYSxJQUFJLDJDQUEyQyxDQUFDO1FBRTdELEtBQUssTUFBTSxNQUFNLElBQUksT0FBTyxFQUFFLENBQUM7WUFDM0IsMkVBQTJFO1lBQzNFLE1BQU0sU0FBUyxHQUFHLEdBQUcsTUFBTSxDQUFDLElB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