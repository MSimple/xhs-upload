export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-24 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton h-24 rounded-3xl" />
        ))}
      </div>
      <div className="skeleton h-80 rounded-3xl" />
    </div>
  );
}
