type CompletedFormPipelineState = {
  formCompleted: boolean;
  stageType: string | null | undefined;
  paymentState: string | null | undefined;
  billingType: string | null | undefined;
  hasCadastralService: boolean;
};

export function isCompletedFormWaitingForPayment({
  formCompleted,
  stageType,
  paymentState,
  billingType,
  hasCadastralService,
}: CompletedFormPipelineState): boolean {
  return formCompleted &&
    ["inviata", "attesa_compilazione"].includes(stageType ?? "") &&
    paymentState !== "pagata" &&
    (billingType === "cliente_finale" || hasCadastralService);
}

