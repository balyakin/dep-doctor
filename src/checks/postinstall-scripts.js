"use strict";

const { fail, pass, warn } = require("./result");

const id = "postinstall-scripts";
const weight = 4;
const INSTALL_SCRIPT_NAMES = ["preinstall", "install", "postinstall"];
const SUSPICIOUS = /\b(curl|wget|powershell|Invoke-WebRequest|bash\s+-c|sh\s+-c|node\s+-e|eval|nc|netcat)\b/i;

function run(dep) {
  const scripts = dep.scripts || {};
  const installScripts = INSTALL_SCRIPT_NAMES
    .filter((name) => scripts[name])
    .map((name) => ({ name, command: scripts[name] }));

  if (!installScripts.length && !dep.hasInstallScript) return pass(id, weight, "no install scripts");
  if (installScripts.some((script) => SUSPICIOUS.test(script.command))) {
    return fail(id, weight, "install script runs network or shell bootstrap command", { scripts: installScripts });
  }
  if (dep.installScriptAgeMinorVersions != null) {
    if (Number(dep.installScriptAgeMinorVersions) === 0) {
      return fail(id, weight, "install script appeared suddenly in this patch/minor version", {
        scripts: installScripts,
        installScriptAgeMinorVersions: Number(dep.installScriptAgeMinorVersions)
      });
    }
    return warn(id, weight, Number(dep.installScriptAgeMinorVersions) >= 5 ? "install script present for 5+ minor versions" : "install script present but not newly introduced", {
      scripts: installScripts,
      installScriptAgeMinorVersions: Number(dep.installScriptAgeMinorVersions)
    });
  }
  if (dep.installScriptIntroducedIn && dep.installScriptIntroducedIn === dep.version) {
    return fail(id, weight, "install script appeared in the installed version", {
      scripts: installScripts,
      installScriptIntroducedIn: dep.installScriptIntroducedIn
    });
  }
  if (dep.hasInstallScript && !installScripts.length) {
    return warn(id, weight, "lockfile reports install script", { scripts: [] });
  }
  return warn(id, weight, "install script present", { scripts: installScripts });
}

module.exports = { id, run, weight };
