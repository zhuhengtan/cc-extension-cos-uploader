# cc-extension-cos-uploader

在 `onAfterBuild` 阶段，将 Cocos Creator 构建完成后的产物上传到腾讯云 COS。

## 社区帖
点点赞啊朋友们😏内含食用方法
[是否苦恼你做的demo没法快速分享给小伙伴们体验？ ](https://forum.cocos.org/t/topic/176036)

## 配置

编辑 `cos.config.json`：

```json
{
  "enabled": true,
  "secretId": "",
  "secretKey": "",
  "bucket": "",
  "region": "",
  "signatureExpires": 900,
  "platformPrefixMap": {
    "web-desktop": "web-desktop",
    "web-mobile": "web-mobile"
  }
}
```

## 说明

- 在启用真实上传前，请先填写 `secretId`、`secretKey`、`bucket` 和 `region`，建议单独开一个子账号，专门给cos上传使用的secretId和secretKey。
- 如果配置不完整，插件会输出警告日志并跳过上传。
- `basePrefix` 不再从构建面板或 `cos.config.json` 中配置，而是始终读取项目根目录 `package.json` 中的 `name` 字段，例如 `endless-defense`。
- `platformPrefixMap` 现在只需要填写后缀部分，例如 `web-mobile`；插件会自动在前面拼接 `<basePrefix>/`。
- 未在 `platformPrefixMap` 中列出的平台，会上传到 `<basePrefix>/<platform>/`。
- 上传过程中，插件会定期检查构建任务是否已进入取消状态，并在可能的情况下调用 COS SDK 的取消接口中止当前上传任务。
- 插件会报警告：不推荐使用cos-nodejs-sdk-v5，推荐使用cos-js-sdk-v5。不用理会，我们就是打包时使用的，不是运行时使用的，所以使用nodejs-sdk，js-sdk中没有封装signature功能，所以无法使用。