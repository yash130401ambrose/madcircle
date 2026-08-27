import { Link, Outlet } from "@remix-run/react";
import styles from "../styles/app.css?url";

export const links = () => [{ rel: "stylesheet", href: styles }];

export default function PartnersLayout() {
  return (
    <div>
      <header
        className="mc-glass"
        style={{
          position: "sticky",
          top: 12,
          margin: "12px auto",
          maxWidth: 1080,
          padding: "12px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <Link to="/partners" style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
          MadCircle
        </Link>
        <nav className="mc-row">
          <Link to="/partners/brands">Brands</Link>
          <Link to="/partners/login">Log in</Link>
          <Link to="/partners/signup" className="mc-btn" style={{ textDecoration: "none" }}>
            Apply
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
