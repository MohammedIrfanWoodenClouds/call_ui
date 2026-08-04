type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <span className="ui-pagination-meta">
        {from}–{to} of {total}
      </span>
      <div className="ui-pagination-actions">
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="ui-pagination-page" aria-current="page">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn-ghost ui-btn-sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function usePaged<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
