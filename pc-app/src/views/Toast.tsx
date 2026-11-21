/** Short message at the bottom; red for errors. */
export function Toast({ text, error }: { text: string; error: boolean })
{
  return <div className={"toast" + (error ? " error" : "")} role="status">{text}</div>;
}
