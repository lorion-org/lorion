import type { DefineComponent } from 'vue';
export type CheckoutActionProps = { shopId: string };
// Setup bindings belong to the component; the owner constrains its required props.
export type CheckoutAction = { component: DefineComponent<CheckoutActionProps, any> };
