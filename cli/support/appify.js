var logger = require("../../server/logger.js"),
    fs = require("fs"),
    wrench = require("wrench"),
    path = require("path"),
    tishadow_app = path.join(__dirname, "../..","app"),
    config = require("./config"),
    _ = require("underscore");

_.templateSettings = {
  interpolate : /\{\{(.+?)\}\}/g
};

 var required_modules = [
        '<module platform="iphone" version="0.1">yy.tidynamicfont</module>',
        '<module platform="iphone" version="0.3">net.iamyellow.tiws</module>',
        '<module platform="android" version="0.1">net.iamyellow.tiws</module>',
        '<module platform="iphone" version="1.0.2">ti.compression</module>',
        '<module platform="android" version="2.0.3">ti.compression</module>'
 ];



exports.copyCoreProject = function(env) {
  var dest = env.destination || ".";
  if (!fs.existsSync(dest) || !fs.lstatSync(dest).isDirectory()) {
    logger.error("Destination folder does not exist.");
    return false;
  }
  if (dest === ".") {
    logger.error("You really don't want to write to the current directory.");
    return false;
  }

  if (env.upgrade) {
    logger.info("Upgrading existing app....");

    if (!fs.existsSync(path.join(dest,'Resources'))) {
      logger.error("Could not find existing tishadow app");
      return false;
    }
    wrench.copyDirSyncRecursive(path.join(tishadow_app, 'Resources'), path.join(dest,'Resources'));
  } else {
    logger.info("Creating new app...");

    wrench.copyDirSyncRecursive(tishadow_app, dest);

    //inject new GUID
    var source_tiapp = fs.readFileSync(path.join(tishadow_app,"tiapp.xml"),'utf8');
    fs.writeFileSync(path.join(dest,"tiapp.xml"), 
         source_tiapp
           .replace("{{GUID}}", 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);})) // GUID one-liner: http://stackoverflow.com/a/2117523
           .replace("{{APPID}}", env.appid)
                    );
  }
  return true;
};

exports.build = function(env) {
  var dest = env.destination || ".";
  var dest_resources = path.join(dest,"Resources");
  var dest_fonts = path.join(dest_resources,"fonts");
  var dest_modules = path.join(dest,"modules");
  var dest_platform = path.join(dest,"platform");
  var template_file = path.join(tishadow_app,"Resources","appify.js");

  //set to bundle mode
  env._name = "bundle";
  var compiler = require("./compiler");
  //bundle the source
  compiler(env,function() {

    //copy tishadow src
    if (exports.copyCoreProject(env)) {
      // generate app.js
      var template = fs.readFileSync(template_file,'utf8');
      var new_app_js = _.template(template, {proto: "http" + (config.isTiCaster ? "s" : ""), host:config.host, port: config.port, room: config.room, app_name: config.app_name});
      fs.writeFileSync(path.join(dest_resources,"app.js"),new_app_js);
      //copy fonts
      if(fs.existsSync(config.fonts_path)) {
        wrench.copyDirSyncRecursive(config.fonts_path,dest_fonts);
      }
      //copy splash screen and icons
      ['iphone','android','blackberry','mobileweb','tizen'].forEach(function(platform) {
        if(fs.existsSync(path.join(config.resources_path,platform))) {
          wrench.copyDirSyncRecursive(path.join(config.resources_path,platform),path.join(dest_resources,platform),{
            filter: new RegExp("(\.png|images|res-.*|fonts|\.otf|\.ttf)$","i"),
            whitelist: true
          });
        }
        if(fs.existsSync(path.join(config.modules_path,platform))) {
          wrench.copyDirSyncRecursive(path.join(config.modules_path,platform),path.join(dest_modules,platform),{preserve:true});
        }
        if(fs.existsSync(path.join(config.platform_path,platform))) {
          wrench.copyDirSyncRecursive(path.join(config.platform_path,platform),path.join(dest_platform,platform));
        }
      });
      // copy tiapp.xml and inject modules
      var source_tiapp = fs.readFileSync(path.join(config.base,"tiapp.xml"),'utf8');
      required_modules.push("</modules>")
      fs.writeFileSync(path.join(dest,"tiapp.xml"), 
                       source_tiapp
                       .replace(/<plugin[^>]*>ti\.alloy<\/plugin>/,"")
                       .replace("<modules/>","<modules></modules>")
                       .replace("</modules>",required_modules.join("\n")));
      // copy the bundle
      fs.writeFileSync(path.join(dest_resources, config.app_name.replace(/ /g,"_") + ".zip"),fs.readFileSync(config.bundle_file));

      logger.info("TiShadow app ready");
    }
  });
}
