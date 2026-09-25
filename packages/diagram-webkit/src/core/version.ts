import pkg from "../../package.json" with { type: "json" };

export const VERSION: string = pkg.version;
export const PROJECT_URL = "https://github.com/diagram-webkit/diagram-webkit";
export const USER_GUIDE_URL = `${PROJECT_URL}/blob/main/docs/user-guide.md`;
