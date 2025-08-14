const definition = {
    fingerprint: [
        { modelID: 'TS0601', manufacturerName: '_TZE204_yrugsphv' },
    ],
    model: 'ARBI_Curtain_Motor',
    vendor: 'Tuyatec',
    description: 'ARBI curtain motor with position control',

    fromZigbee: [
        {
            cluster: 'manuSpecificTuya',
            type: ['commandDataResponse', 'commandDataReport'],
            convert: (model, msg, publish, options, meta) => {
                const dp = msg.data.dp;
                const data = msg.data.data;
                if (!data || !Array.isArray(data) || data.length === 0) {
                    return;
                }

                const value = data[0];

                if (dp === 1) {
                    return {
                        state: value === 0 ? 'CLOSE' :
                               value === 2 ? 'OPEN' :
                               value === 1 ? 'STOP' : undefined,
                    };
                }

                if (dp === 3) { // position state (0–100)
                    return {
                        position: value,
                    };
                }

                return null;
            },
        },
    ],

    toZigbee: [
        {
            key: ['state'],
            convertSet: async (entity, key, value, meta) => {
                const lookup = {'OPEN': 2, 'STOP': 1, 'CLOSE': 0};
                const tuyaCommand = lookup[value.toUpperCase()];
                if (tuyaCommand === undefined) {
                    throw new Error(`Unsupported state: ${value}`);
                }

                await entity.command('manuSpecificTuya', 'dataRequest', {
                    seq: 0,
                    dpValues: [{
                        dp: 1,
                        datatype: 0,
                        data: [tuyaCommand],
                    }],
                }, {disableDefaultResponse: true});

                return {state: value.toUpperCase()};
            },
        },
        {
            key: ['position'],
            convertSet: async (entity, key, value, meta) => {
                const position = Number(value);
                if (isNaN(position) || position < 0 || position > 100) {
                    throw new Error(`Invalid position value: ${value}`);
                }

                // Кодируем позицию в 4-байтовое целое число (Big Endian)
                const buf = Buffer.alloc(4);
                buf.writeUInt32BE(position, 0);
                const data = Array.from(buf);

                await entity.command('manuSpecificTuya', 'dataRequest', {
                    seq: 0,
                    dpValues: [{
                        dp: 2,
                        datatype: 2,
                        data: data,
                    }],
                }, {disableDefaultResponse: true});

                return {position};
            },
        },
    ],

    exposes: [
        {
            type: 'enum',
            name: 'state',
            property: 'state',
            values: ['OPEN', 'STOP', 'CLOSE'],
            access: 7,
            description: 'Control curtain motor',
        },
        {
            type: 'numeric',
            name: 'position',
            property: 'position',
            access: 7,
            unit: '%',
            value_min: 0,
            value_max: 100,
            description: 'Curtain position (0 = closed, 100 = open)',
        },
    ],

    meta: {
        tuyaDatapoints: true,
    },
};

module.exports = definition;
