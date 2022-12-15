import httpStatus from "http-status-codes";

import Logger from "../helpers/Logger";
import { VTEX } from "../helpers/VTEXFetch";
import { getAppSettings } from "../helpers/ConnectorHelper";

const LOG_TYPE = "orderCancel";

export async function orderCancel(ctx: Context) {
  const { vtex, response, query } = ctx;
  const emagOrderId = query.order_id;
  try {
    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${emagOrderId}`,
      { id: emagOrderId },
      emagOrderId
    );

    const appSettings = await getAppSettings(vtex);
    const VTEXOrderId = `${appSettings.affiliateId}-${emagOrderId}`;
    const reason = "Cancelled by eMAG user";
    const VTEXResponse = await VTEX.cancelOrder(vtex, VTEXOrderId, reason);

    if (!VTEXResponse) {
      throw {
        code: "New order error",
        message: "VTEX order created with error",
        data: VTEXResponse,
      };
    }

    // Don't know if you need to unknowledge this callback
    // if (VTEXResponse[0].orderId.indexOf(appSettings.affiliateId) !== -1) {
    //   const acknowledge = await EMAG.sendOrderAcknowledge(vtex, orderId);
    //   if (!acknowledge || acknowledge.isError) {
    //     throw {
    //       code: "eMAG acknowledge error",
    //       message: "eMAG order acknowledge ended with error",
    //       data: acknowledge,
    //     };
    //   }
    // }

    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${emagOrderId} ended successfully`,
      { emagOrderId, VTEXOrderId, VTEXResponse },
      emagOrderId
    );

    response.body = VTEXResponse;
    response.status = httpStatus.OK;
  } catch (error) {
    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${emagOrderId} ended with error`,
      error,
      emagOrderId
    );
    response.body = error;
    response.status = httpStatus.BAD_REQUEST;
  }
}
