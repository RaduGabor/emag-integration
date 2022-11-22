import httpStatus from "http-status-codes";
import { EMAG } from "../helpers/EMAGFetch";

import Logger from "../helpers/Logger";
import { VTEX } from "../helpers/VTEXFetch";
import { EmagOrder } from "../typings/orderNotify";
import { getAppSettings } from "../helpers/ConnectorHelper";

const LOG_TYPE = "orderCancel";

export async function orderCancel(ctx: Context) {
  const { vtex, response, query } = ctx;
  const orderId = query.order_id;
  try {
    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${orderId}`,
      { id: orderId },
      orderId
    );
    const eMAGOrder: EmagOrder  = await EMAG.getOrder(vtex, orderId);
    if (!eMAGOrder) {
      throw {
        code: "Order not found",
        message: `eMAG order with id ${orderId} not found`,
        data: eMAGOrder,
      };
    }

    const appSettings = await getAppSettings(vtex);
    const VTEXResponse = await VTEX.cancelOrder(vtex, appSettings, orderId);

    if (!VTEXResponse?.length) {
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
    //   VTEX.authorizeFulfillment(vtex, appSettings, VTEXResponse[0].orderId);
    // }

    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${orderId} ended successfully`,
      { eMAGOrder, VTEXResponse },
      orderId
    );

    response.body = VTEXResponse;
    response.status = httpStatus.OK;
  } catch (error) {
    await Logger.createDBLog(
      vtex,
      LOG_TYPE,
      `Order cancel for ID ${orderId} ended with error`,
      error,
      orderId
    );
    response.body = error;
    response.status = httpStatus.BAD_REQUEST;
  }
}
