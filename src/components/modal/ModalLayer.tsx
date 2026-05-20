import { useAppStore } from "@app/stores/appStore";
import { ModalShell } from "./ModalShell";
import { NewVariantModal } from "./NewVariantModal";

/**
 * App-level modal switchboard. Reads `appStore.modal` and renders the
 * matching modal inside a single `ModalShell`. Mounted once at the App
 * root so z-index and focus-management stays consistent across modals.
 */
export const ModalLayer = () => {
  const modal = useAppStore((s) => s.modal);
  const closeModal = useAppStore((s) => s.closeModal);

  return (
    <ModalShell
      open={modal !== null}
      onClose={closeModal}
      aria-labelledby="new-variant-title"
    >
      {modal === "new-variant" && <NewVariantModal onClose={closeModal} />}
    </ModalShell>
  );
};

export default ModalLayer;
