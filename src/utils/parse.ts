import * as _ from "lodash";
import { transformSync } from "@babel/core";
import babelPluginProposalObjectRestSpread from "@babel/plugin-proposal-object-rest-spread";
import babelPluginProposalOptionalChaining from "@babel/plugin-proposal-optional-chaining";
import babelPluginTypescriptJsx from "@babel/plugin-transform-react-jsx-source";
import pluginTransformTypescript from "@babel/plugin-transform-typescript";
import babelPresetReact from "@babel/preset-react";
import babelPresetTypescriptReact from "@babel/preset-typescript";
import { parseForESLint } from "babel-eslint";
import findBabelConfig from "find-babel-config";
import { ESLint, Linter } from "eslint";
const jsonFix = require('json-fixer');

const eslintPlugins = {
  react: require("eslint-plugin-react"),
  "react-hooks": require("eslint-plugin-react-hooks"),
  "unused-imports": require("eslint-plugin-unused-imports"),
  prettier: require("eslint-plugin-prettier"),
};

const linterConfig = {
  parser: parseForESLint,
  parserOptions: {
    ecmaFeatures: { jsx: true },
    ecmaVersion: 2017,
    sourceType: "module",
  },
};

const linter = new (class CustomLinter extends Linter {
  constructor(...args: any) {
    super(...args);

    _.chain(eslintPlugins as any)
      .keys()
      .forEach((pluginName: any) => {
        this.defineRules(
          _.chain(eslintPlugins[pluginName].rules)
            .keys()
            .reduce((res: any, ruleId: any) => {
              return {
                ...res,
                [`${pluginName}/${ruleId}`]: eslintPlugins[pluginName].rules[
                  ruleId
                ],
              };
            }, {})
            .value()
        );
      })
      .value();
  }

  extractEntityNames(textOrSourceCode: any, config: any) {
    let lintMessages = [];
    try {
      lintMessages = super.verify(textOrSourceCode, {
        ...linterConfig,
        ...config,
      });
    } catch (error) {
      console.log(error, "error");
    }


    return _.chain(lintMessages)
      .map(
        ({ message }: { message: any }) =>
          message.match(/^[^']*'(?<entityName>[^']+)'.*/)?.groups.entityName
      )
      .compact()
      .uniq()
      .value();
  }

  verifyAndFix(textOrSourceCode: any, config: any) {
    return super.verifyAndFix(textOrSourceCode, {
      ...linterConfig,
      ...config,
    }, { fix: true });
  }
})();

const transformCode = (code: any) => {
  return transformSync(code, {
    filename: 'file.ts',
    presets: [babelPresetReact, [babelPresetTypescriptReact, { isTSX: true, allExtensions: true }]],
    plugins: [
      [pluginTransformTypescript, { loose: true, "allowNamespaces": true, isTSX: true }],
      [babelPluginTypescriptJsx, { loose: true }],
      [babelPluginProposalOptionalChaining, { loose: true }],
      [babelPluginProposalObjectRestSpread, { loose: true }],
    ],
  }).code;
};

const getUnusedVars = (code: any) => {
  try {
    const transformedCode = transformCode(code);
    return linter.extractEntityNames(transformedCode, {
      rules: {
        "no-unused-vars": "error",
      },
    });
  } catch (error) {
    return code;
  }

};

const getUndefinedVars = (code: any) => {
  try {
    const transformedCode = transformCode(code);

    return linter.extractEntityNames(transformedCode, {
      rules: {
        "react/jsx-no-undef": "error",
        "no-undef": "error",
      },
    });
  } catch (error) {
    return code;
  }

};

const getUsedImports = (code: any, options: any = { transform: true }) => {
  if (options?.transform) {
    code = transformCode(code);
  };
  let allImports: any[] = getImports(code, { transform: false });
  const reactNativeImportIndex: number = allImports.findIndex(_import => /import {[^}]*}.*(?='react-native').*/.test(_import));
  if (reactNativeImportIndex > -1) {
    allImports[reactNativeImportIndex] = allImports[reactNativeImportIndex].replace(/(\}\s+from)/, ', StyleSheet$1');
  }
  return allImports;
};

const pretify = (code: any) => {
  try {
    return linter.verifyAndFix(code, {
      rules: eslintPlugins.prettier.configs.recommended.rules,
    }).output;
  } catch (error) {
    return code;
  }

};

const getImports = (code: any, options: any = { transform: true }) => {
  return _.chain(options?.transform ? transformCode(code) : code)
    .split("\n")
    .filter((codeLine: any) => /^\s*import.*from.*/.test(codeLine))
    .value();
};

const getNumberOfLeadingSpaces = (code: any, options: any = { endToStart: false }) => {
  const codeLines = _.split(code, "\n");

  if (options?.endToStart) {
    _.reverse(codeLines);
  }

  const firstCodeLineIndex = _.findIndex(codeLines, (line: any) =>
    options?.endToStart ? /^\s*[<|\/>].*$/.test(line) : /^\s*<.*$/.test(line)
  );
  const firstSpaceIndex = codeLines[firstCodeLineIndex].search(/\S/);

  return Math.max(0, firstSpaceIndex);
};

const eslintAutofix = (code: any, { filePath }: { filePath: any }) => {
  try {
    const { file: babelConfigFilePath } = findBabelConfig.sync(filePath);


    const eslint = new ESLint({
      baseConfig: {
        parserOptions: {
          babelOptions: {
            configFile: babelConfigFilePath,
          },
        },
      },
      fix: true,
    });

    return new Promise((resolve) => {
      eslint
        .lintText(code, { filePath })
        .then((results: any) => resolve(results[0].output));
    });
  } catch (error) {
    return new Promise((resolve) => resolve(code));;
  }

};

const getUriExtension = (url) => {
  return url.split(/[#?]/)[0].split('.').pop().trim();
};

const getUsedStyleSheetObjects = (selection: string, stylesheetObject: any, stylesheetName: string) => {
  let usedStylesheetObject = {};
  try {
    const styleNamesRegex = new RegExp(`(?<=${stylesheetName}.)(\\w+)`, "g");
    const stylesNameResults = selection.match(styleNamesRegex);
    const { data } = jsonFix(stylesheetObject);
    stylesNameResults.forEach(name => {
      Object.assign(usedStylesheetObject, { [name]: data[name] });
    });
  } catch (error) {
  }
  return JSON.stringify(usedStylesheetObject, null, 2);
};

const getStylesheetNameAndObject = (code: string, selection: string) => {
  let stylesheetName = "styles";
  let stylesheetObject = "{}";
  try {
    const nameAndObjectRegex = new RegExp(/(\w+) +?= +?StyleSheet.create\(({\n(.+\n)+\})\);/, "g");
    const stylesheetMatchResults = nameAndObjectRegex.exec(code);
    stylesheetName = stylesheetMatchResults[1];
    stylesheetObject = getUsedStyleSheetObjects(selection, stylesheetMatchResults[2] || stylesheetObject, stylesheetName);
  } catch (error) {

  }
  return { stylesheetName, stylesheetObject };
};

const getStylesheet = (code: string, selection: string) => {
  const { stylesheetName, stylesheetObject } = getStylesheetNameAndObject(code, selection);
  const stylesheet = `
  const ${stylesheetName} = StyleSheet.create(${stylesheetObject});
  `;
  return stylesheet;
};

export default {
  eslintAutofix,
  getImports,
  getNumberOfLeadingSpaces,
  getUndefinedVars,
  getUnusedVars,
  getUsedImports,
  pretify,
  transformCode,
  getUriExtension,
  getStylesheet
};
