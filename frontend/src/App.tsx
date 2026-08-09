import {Navigate, Route, BrowserRouter as Router, Routes} from 'react-router-dom'

import {Funder} from './pages/Funder'
import {Landing} from './pages/Landing'
import {Merchant} from './pages/Merchant'
import {OfferDetail} from './pages/OfferDetail'

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/merchant" element={<Merchant />} />
        <Route path="/funder" element={<Funder />} />
        <Route path="/offer/:address" element={<OfferDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
