export const regexNormalizeResult = (result) => {
  return result.replace(/\n/g, "").replace(/\\"/g, '"').replace(/"\{/g, "{").replace(/\}"/g, "}");
};
