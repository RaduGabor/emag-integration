
import { getAppSettings } from "../helpers/ConnectorHelper";
export async function redirectToMapper(ctx: Context) {
  const { vtex } = ctx;
  const appSettings = await getAppSettings(vtex);
  const { mkpMapperId } = appSettings
  console.log(mkpMapperId)
}
