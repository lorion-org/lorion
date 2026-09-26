export type CheckoutInput = { shopId: string };
export type PaymentCheckoutProvider = {
  id: string;
  label: string;
  createCheckoutPath: (input: CheckoutInput) => string;
};
