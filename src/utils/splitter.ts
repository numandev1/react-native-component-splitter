import * as _ from "lodash";
import { window, Range, Position } from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import parseUtils from "./parse";
import { regexNormalizeResult } from "./common";

const validateSelection = () => {
  const editor = window.activeTextEditor;
  const selection = editor.document.getText(editor.selection);

  try {
    parseUtils.transformCode(`<View>${selection}</View>`);
  } catch (error) {
    console.log(error, "error");
    throw new Error(
      "Invalid selection. Make sure your selection represents a valid React component"
    );
  }

  const codeWithoutSelection = replaceCodeByRange(
    editor.document.getText(),
    editor.selection,
    "<View></View>"
  );

  try {
    parseUtils.transformCode(codeWithoutSelection);
  } catch (error) {
    console.log(error, "error");
    throw new Error(
      "Invalid selection. Make sure the code remains valid without your selection"
    );
  }
};

const buildComponentPath = (name) => {
  const activeDocumentPath = window.activeTextEditor.document.uri.fsPath;
  const activeDocumentExtension = activeDocumentPath.replace(
    /(.*)+\.[^\.]+/,
    "$1"
  );
  const nameWithoutExtension = name.replace(/\.[^\.]+$/, "");

  return path.join(
    activeDocumentPath,
    "..",
    `${nameWithoutExtension}.${activeDocumentExtension}`
  );
};

const askForComponentName = async () => {
  let name = await window.showInputBox({
    prompt: "Choose a name for the new component",
    ignoreFocusOut: true,

    placeHolder: "New component name...",
  });

  if (_.isNil(name)) {
    throw new Error("Empty name received");
  }
  if (!/^[A-Z][0-9a-zA-Z_$]*$/g.test(name)) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  if (fs.pathExistsSync(buildComponentPath(name))) {
    throw new Error(
      "File with this component name already exists in the current folder"
    );
  }

  return name;
};

const replaceCodeByRange = (code: any, range: any, replaceValue: any) => {
  const lines = _.split(code, "\n");

  const { startIndex, endIndex } = _.reduce(
    lines,
    (res, line, index) => {
      if (index < range.start.line) {
        res.startIndex = res.startIndex + _.size(line) + 1;
      }

      if (index === range.start.line) {
        res.startIndex = res.startIndex + range.start.character;
      }

      if (index < range.end.line) {
        res.endIndex = res.endIndex + _.size(line) + 1;
      }

      if (index === range.end.line) {
        res.endIndex = res.endIndex + range.end.character;
      }

      return res;
    },
    { startIndex: 0, endIndex: 0 }
  );

  return `${code.substring(0, startIndex)}${replaceValue}${code.substring(
    endIndex
  )}`;
};

const getFullDocumentRange = (document) =>
  new Range(
    document.positionAt(0),
    document.positionAt(_.size(document.getText()))
  );

const getFirstAndLastImportLineIndexes = (codeLines) => {
  const isImportLine = (line) => /^\s*import.*from.*/.test(line);
  const firstImportLineIndex = _.findIndex(codeLines, isImportLine);
  const lastImportLineIndex = _.findLastIndex(codeLines, isImportLine);

  return { firstImportLineIndex, lastImportLineIndex };
};

const replaceSelection = async ({ reactElement, name }) => {
  const editor = window.activeTextEditor;
  const { document } = editor;
  const codeLines = _.split(document.getText(), "\n");
  const { lastImportLineIndex } = getFirstAndLastImportLineIndexes(codeLines);

  await editor.edit((edit) => {
    edit.replace(editor.selection, reactElement);
    edit.insert(
      new Position(lastImportLineIndex + 1, 0),
      `import ${name} from './${name}';\n`
    );
  });

  parseUtils
    .eslintAutofix(document.getText(), { filePath: document.uri.fsPath })
    .then((output: any) => {
      if (!output) {
        return;
      }

      editor.edit((edit) =>
        edit.replace(getFullDocumentRange(document), output)
      );
    });
};

const removeUnusedImports = async () => {
  const editor = window.activeTextEditor;
  const { document } = editor;
  const code = document.getText();
  const codeLines = _.split(code, "\n");
  const { firstImportLineIndex, lastImportLineIndex } =
    getFirstAndLastImportLineIndexes(codeLines);

  const importsString = _.chain(codeLines)
    .slice(firstImportLineIndex, lastImportLineIndex + 1)
    .join("\n")
    .value();
  const usedImportsString = _.join(parseUtils.getUsedImports(code), "\n");
  const codeWithUsedImports = _.replace(code, importsString, usedImportsString);

  await editor.edit((edit) =>
    edit.replace(getFullDocumentRange(document), codeWithUsedImports)
  );

  parseUtils
    .eslintAutofix(document.getText(), { filePath: document.uri.fsPath })
    .then((output: any) => {
      if (!output) {
        return;
      }

      editor.edit((edit) =>
        edit.replace(getFullDocumentRange(document), output)
      );
    });
};

const updateOriginalComponent = async ({ newComponent }) => {
  await replaceSelection(newComponent);
  await removeUnusedImports();
};

const generateReactElement = ({ name, props, jsx }) => {
  const numberOfProps = _.size(props);
  const numberOfLeadingSpacesFromStart =
    parseUtils.getNumberOfLeadingSpaces(jsx);
  const leadingSpacesFromStart = _.repeat(" ", numberOfLeadingSpacesFromStart);
  let propsString = "";

  if (numberOfProps > 3) {
    const numberOfLeadingSpacesFromEnd = parseUtils.getNumberOfLeadingSpaces(
      jsx,
      { endToStart: true }
    );
    const leadingSpacesFromEnd = _.repeat(" ", numberOfLeadingSpacesFromEnd);
    propsString = `\n${leadingSpacesFromEnd}  {...{\n${leadingSpacesFromEnd}    ${_.join(
      props,
      `,\n${leadingSpacesFromEnd}    `
    )},\n  ${leadingSpacesFromEnd}}}\n${leadingSpacesFromEnd}`;
  } else if (numberOfProps > 0) {
    propsString = ` {...{ ${_.join(props, ", ")} }}`;
  }

  return `${leadingSpacesFromStart}<${name}${propsString}/>`;
};

const extractRelevantImportsAndPropsAndStylesheet = () => {
  const editor = window.activeTextEditor;
  const code = editor.document.getText();
  const selection = editor.document.getText(editor.selection);

  const selectionAndImports = `
        ${buildImportsString(parseUtils.getImports(code))}\n
        export default () => { return (<View>${selection}</View>)};
    `;
  const props = parseUtils.getUndefinedVars(selectionAndImports);
  const imports = parseUtils.getUsedImports(selectionAndImports);
  const stylesheet = regexNormalizeResult(
    parseUtils.getStylesheet(code, selection)
  );
  return {
    props,
    imports,
    stylesheet,
  };
};

const buildImportsString = (imports) => _.join(imports, "\n");

const buildPropsString = (props) => {
  const numberOfProps = _.size(props);

  if (numberOfProps > 2) {
    return `{\n  ${_.join(props, `,\n  `)},\n}`;
  }
  if (numberOfProps === 2) {
    return `{${_.join(props, ", ")}}`;
  }
  if (numberOfProps === 1) {
    return `{${props[0]}}`;
  }

  return "";
};

const shouldWrapCodeWithEmptyTag = (code) => {
  try {
    parseUtils.transformCode(code);
  } catch {
    return true;
  }
};

const createNewComponent = async (componentName: any) => {
  const editor = window.activeTextEditor;
  const uri = editor.document.uri;
  const fileExtension = parseUtils.getUriExtension(uri.fsPath);
  const selection = editor.document.getText(editor.selection);
  const { imports, props, stylesheet } =
    extractRelevantImportsAndPropsAndStylesheet();

  const newComponent = {
    code: parseUtils.pretify(
      `${buildImportsString(imports)}\n\n` +
      `const ${componentName} = (${buildPropsString(props)}) => {\nreturn (\n` +
      `${shouldWrapCodeWithEmptyTag(selection)
        ? `<View>\n${selection}\n</View>`
        : selection
      }\n` +
      `)\n\n}\n\n` +
      `export default ${componentName};\n\n${stylesheet}\n`
    ),
    reactElement: generateReactElement({
      name: componentName,
      props,
      jsx: selection,
    }),
    imports,
    name: componentName,
    path: path.join(uri.fsPath, "..", `${componentName}.${fileExtension}`),
    props,
  };

  parseUtils
    .eslintAutofix(newComponent.code, { filePath: newComponent.path })
    .then((output) => {
      fs.writeFileSync(newComponent.path, output || newComponent.code);
    });

  return newComponent;
};

export {
  createNewComponent,
  askForComponentName,
  validateSelection,
  updateOriginalComponent,
};
