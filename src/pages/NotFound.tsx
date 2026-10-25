import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="font-num text-sm text-bad">404 · route partitioned</div>
      <h1 className="mt-2 font-display text-3xl font-semibold">Nothing answered on this path</h1>
      <p className="mt-2 text-muted">The page you asked for does not exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to safety
      </Link>
    </div>
  );
}
