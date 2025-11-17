
/**
 * @fileoverview Layout for the data import page.
 * This layout component ensures that the page title context from the parent
 * admin layout is available to its children, allowing the import page to
 * set its own title within the admin section.
 */
'use client';

export default function ImportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
    // This layout simply passes the context of the page title to its children.
    // This is necessary so that the import page can set its own title.
    return <>{children}</>;
}
