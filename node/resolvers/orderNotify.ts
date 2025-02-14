import { IOContext } from "@vtex/api";
import { POSTAL_CODE } from "../helpers/PostalCodeHelper";
import { VTEX } from "../helpers/VTEXFetch";
import { VtexEmagProduct } from "../typings/productNotify";
import {
  EmagOrder,
  EmagOrderProduct,
  VTEXOrderProduct,
} from "../typings/orderNotify";
import { syncEmagProductsResolver } from "./syncEmagProducts";

export async function createVTEXOrder(
  vtex: IOContext,
  appSettings: AppSettings,
  eMAGOrder: EmagOrder,
  orderId: string
) {
  const whereQuery = eMAGOrder.products.map(ep => `eMAGProductID=${ep.product_id}`).join(' OR ');

  const savedProducts = (await VTEX.getAllDocuments(vtex, "products", {
    fields: "id,VTEXSkuID,eMAGProductID,syncStatus",
    where: `(${whereQuery})`,
    pagination: "0-100"
  })) as VtexEmagProduct[];

  const usedProducts = eMAGOrder.products?.filter(
    (eMAGProduct: EmagOrderProduct) =>
    savedProducts.findIndex(
        (dbProduct: VtexEmagProduct) => String(dbProduct.eMAGProductID) === String(eMAGProduct.product_id)
      ) > -1
    );

  if (!usedProducts.length) {
    throw {
      code: "New order error",
      message: "No products mapped for this order",
      data: eMAGOrder,
    };
  }

  syncProducts(vtex, savedProducts, usedProducts);
  const items = getItems(usedProducts, appSettings.valueConcatProductId);

  const postalCode = (POSTAL_CODE as { [label: string]: string })[
    eMAGOrder.customer.shipping_suburb
  ];

  const { shipping_tax } = eMAGOrder;

  const logisticsInfo = await getLogisticsInfo(
    vtex,
    appSettings,
    items,
    postalCode,
    shipping_tax
  );

  const clientSplitName = eMAGOrder.customer.name.split(" ");
  let marketplacePaymentValue = 0;
  for (const item of items) {
    marketplacePaymentValue += item.price * item.quantity;
  }
  for (const infos of logisticsInfo) {
    marketplacePaymentValue += infos ? infos.price : 0;
  }
  return {
    clientProfileData: {
      corporateDocument: null,
      corporateName: eMAGOrder.customer.legal_entity? eMAGOrder.customer.company : null,
      corporatePhone: null,
      document: eMAGOrder.customer.id,
      documentType: null,
      email: eMAGOrder.customer.email
        ? eMAGOrder.customer.email
        : `emag-customer-${eMAGOrder.id}@dacris.net`,
      id: "clientProfileData",
      isCorporate: !!eMAGOrder.customer.legal_entity,
      lastName: clientSplitName[clientSplitName.length - 1],
      firstName: clientSplitName.splice(1).join(" "),
      phone: eMAGOrder.customer.phone_1,
      stateInscription: null,
      tradeName: null,
      userProfileId: null,
    },
    marketplaceOrderId: orderId,
    marketplacePaymentValue,
    marketplaceServicesEndpoint: `https://${vtex.account}.myvtex.com/api/io/emag/`,
    openTextField: {
      payment_mode: eMAGOrder.payment_mode,
      detailed_payment_method: eMAGOrder.detailed_payment_method
    },
    paymentData: null,
    shippingData: {
      address: {
        addressId: eMAGOrder.customer.shipping_street,
        addressType: "Residencial",
        city: eMAGOrder.customer.shipping_city,
        complement: null,
        country:
          eMAGOrder.customer.shipping_country === "RO"
            ? "ROU"
            : eMAGOrder.customer.shipping_country,
        geoCoordinates: [],
        neighborhood: null,
        number: null,
        postalCode,
        receiverName: eMAGOrder.customer.name,
        reference: null,
        state: eMAGOrder.customer.shipping_suburb,
        street: eMAGOrder.customer.shipping_street,
      },
      id: "shippingData",
      logisticsInfo,
    },
    items,
  };
}

function getItems(
  products: EmagOrderProduct[],
  prefix: string
): VTEXOrderProduct[] {
  return products.map((item) => ({
    attachments: [],
    bundleItems: [],
    commission: 0,
    freightCommission: 0,
    id: String(item.product_id).replace(prefix, ""),
    isGift: false,
    itemAttachment: {
      content: {},
      name: null,
    },
    measurementUnit: null,
    price: parseInt(
      (parseFloat(item.sale_price) * (parseFloat(item.vat) + 1))
        .toFixed(2)
        .replace(".", ""),
      10
    ),
    quantity: item.quantity,
    seller: "1",
    unitMultiplier: 0,
  }));
}

async function getLogisticsInfo(
  vtex: IOContext,
  appSettings: AppSettings,
  items: VTEXOrderProduct[],
  postalCode: string,
  shippingTax: number
) {
  const productsSimulation = items.map((product: VTEXOrderProduct) => ({
    id: product.id,
    quantity: product.quantity,
    seller: "1",
  }));
  const logisticsInfo = await VTEX.orderSimulation(vtex, appSettings, {
    items: productsSimulation,
    postalCode,
    country: "ROU",
  });

  const selectedSla = logisticsInfo[0]?.slas.find(
    (item: { id: string }) => item.id === "eMAG"
  );

  if (!selectedSla) {
    throw {
      code: "SLA not found",
      message:
        "Please check if your warehouses are pointing to eMag loading dock.",
      data: logisticsInfo,
    };
  }

  return logisticsInfo.map((item) => ({
    deliveryWindow: selectedSla.availableDeliveryWindows[0],
    itemIndex: item.itemIndex,
    lockTTL: "7bd",
    price: typeof shippingTax !== undefined ? shippingTax * 100 : selectedSla.price,
    selectedSla: selectedSla.id,
    shippingEstimate: selectedSla.shippingEstimate,
  }));
}

async function syncProducts(
  vtex: IOContext,
  allProducts: VtexEmagProduct[],
  usedProducts: EmagOrderProduct[]
) {
  const forSyncProducts = allProducts.filter(
    (dbProduct: VtexEmagProduct) =>
      dbProduct.syncStatus !== "EMAG_SUCCESS" &&
      usedProducts.findIndex(
        (usedProduct: EmagOrderProduct) =>
          String(dbProduct.eMAGProductID) === String(usedProduct.product_id)
      ) > -1
  );
  if (forSyncProducts.length) {
    await syncEmagProductsResolver(vtex, forSyncProducts);
  }
}
