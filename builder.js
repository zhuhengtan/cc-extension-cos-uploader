const fs = require('fs');
const path = require('path');

function getCosConfig() {
  const configPath = path.join(__dirname, 'cos.config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {}
  }
  return {};
}

const defaultCfg = getCosConfig();

module.exports = {
  load() {
    console.log('[cc-extension-cos-uploader] builder loaded');
  },
  unload() {
    console.log('[cc-extension-cos-uploader] builder unloaded');
  },
  configs: {
    '*': {
      hooks: './hooks',
      options: {
        enabled: {
          label: '启用 COS 自动上传',
          default: defaultCfg.enabled !== false,
          render: {
            ui: 'ui-checkbox',
          }
        },
        secretId: {
          label: 'SecretId',
          default: defaultCfg.secretId || '',
          render: {
            ui: 'ui-input',
          }
        },
        secretKey: {
          label: 'SecretKey',
          default: defaultCfg.secretKey || '',
          render: {
            ui: 'ui-input',
            attributes: { type: 'password' }
          }
        },
        bucket: {
          label: 'Bucket',
          default: defaultCfg.bucket || '',
          render: {
            ui: 'ui-input',
          }
        },
        region: {
          label: 'Region',
          default: defaultCfg.region || '',
          render: {
            ui: 'ui-input',
          }
        },
      }
    },
  },
};
