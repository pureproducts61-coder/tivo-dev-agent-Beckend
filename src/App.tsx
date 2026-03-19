import { BrowserRouter, Routes, Route } from "react-router-dom";
import PublicStatus from "./pages/PublicStatus";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="*" element={<PublicStatus />} />
    </Routes>
  </BrowserRouter>
);

export default App;
