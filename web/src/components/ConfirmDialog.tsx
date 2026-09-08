interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ width: "min(380px, 90vw)" }} onClick={(e) => e.stopPropagation()}>
        {title && <h3>{title}</h3>}
        <p style={{ margin: 0 }}>{message}</p>
        <div className="actions-row">
          <button className={danger ? "danger" : undefined} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
