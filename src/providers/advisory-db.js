"use strict";

const { versionMatches } = require("../utils/semver");

const ADVISORIES = [
  {
    ecosystem: "npm",
    name: "ua-parser-js",
    range: "<=0.7.33",
    severity: "HIGH",
    id: "GHSA-ua-parser-js-compromise",
    title: "Malicious or vulnerable ua-parser-js release",
    fixed: "0.7.34"
  },
  {
    ecosystem: "npm",
    name: "lodash",
    range: "<4.17.21",
    severity: "HIGH",
    id: "GHSA-35jh-r3h4-6jhm",
    title: "Prototype pollution in lodash",
    fixed: "4.17.21"
  },
  {
    ecosystem: "npm",
    name: "minimist",
    range: "<1.2.6",
    severity: "MODERATE",
    id: "GHSA-xvch-5gv4-984h",
    title: "Prototype pollution in minimist",
    fixed: "1.2.6"
  },
  {
    ecosystem: "npm",
    name: "event-stream",
    range: ">=3.3.6 <=4.0.1",
    severity: "HIGH",
    id: "MAL-2018-event-stream",
    title: "Compromised event-stream supply chain",
    fixed: "3.3.4",
    type: "rollback"
  },
  {
    ecosystem: "npm",
    name: "axios",
    range: "<0.21.2",
    severity: "HIGH",
    id: "GHSA-jr5f-v2jv-69x6",
    title: "Server-side request forgery in axios",
    fixed: "0.21.2"
  },
  {
    ecosystem: "python",
    name: "django",
    range: "<3.2.25",
    severity: "HIGH",
    id: "PYSEC-django-lts",
    title: "Django version below maintained security baseline",
    fixed: "3.2.25"
  },
  {
    ecosystem: "python",
    name: "jinja2",
    range: "<3.1.4",
    severity: "MODERATE",
    id: "PYSEC-jinja2-2024",
    title: "Template sandbox escape risk in old Jinja2",
    fixed: "3.1.4"
  },
  {
    ecosystem: "python",
    name: "pyyaml",
    range: "<6.0",
    severity: "HIGH",
    id: "PYSEC-pyyaml-load",
    title: "Unsafe YAML loading in old PyYAML",
    fixed: "6.0"
  },
  {
    ecosystem: "cargo",
    name: "time",
    range: "<0.2.23",
    severity: "HIGH",
    id: "RUSTSEC-2020-0071",
    title: "Potential segfault in time",
    fixed: "0.2.23"
  },
  {
    ecosystem: "cargo",
    name: "openssl",
    range: "<0.10.55",
    severity: "MODERATE",
    id: "RUSTSEC-openssl-baseline",
    title: "OpenSSL crate below maintained security baseline",
    fixed: "0.10.55"
  },
  {
    ecosystem: "go",
    name: "golang.org/x/crypto",
    range: "<0.17.0",
    severity: "HIGH",
    id: "GO-2023-x-crypto",
    title: "golang.org/x/crypto below maintained security baseline",
    fixed: "0.17.0"
  },
  {
    ecosystem: "go",
    name: "github.com/gin-gonic/gin",
    range: "<1.9.1",
    severity: "MODERATE",
    id: "GO-gin-baseline",
    title: "Gin below maintained security baseline",
    fixed: "1.9.1"
  }
];

function findAdvisories(ecosystem, name, version) {
  const normalizedName = String(name || "").toLowerCase();
  return ADVISORIES.filter((advisory) => (
    advisory.ecosystem === ecosystem &&
    advisory.name.toLowerCase() === normalizedName &&
    versionMatches(version, advisory.range)
  ));
}

module.exports = { ADVISORIES, findAdvisories };
