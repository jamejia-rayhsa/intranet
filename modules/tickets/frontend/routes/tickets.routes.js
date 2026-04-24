import { Routes, Route } from "react-router-dom";
import TicketPage from "../pages/TicketPage";

export default function RutasTickets() {
  return (
    <Routes>
      <Route path="/" element={<TicketPage />} />
      <Route path="/:id" element={<TicketPage />} />
    </Routes>
  );
}
