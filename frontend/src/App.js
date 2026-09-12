import {BrowserRouter, Route, Routes} from "react-router-dom";
import {MapPage} from "./page/MapPage";
import { Layout } from "./components/Layout";
import { Profile } from "./page/Profile/Profile";
import { LikeBorsch } from "./page/LikeBorsch/LikeBorsch";
import { List } from "./page/List";
import { AddPage } from "./page/AddPage/AddPage";
import { ListPage } from "./page/ListPage/ListPage";
import {BorschPage} from "./page/BorschPage";
import { PrivateRoute } from "./components/PrivateRoute/PrivateRoute";
import {PersonalInfo} from "./page/PersonalInfo";
import { EvaluationsPage } from "./page/EvaluationsPage";
import { SelectPlacePage } from "./page/SelectPlacePage";
import { AddBorschFlow } from "./page/AddBorschFlow";
// import {UserPasswordPage} from "./page/UserPasswordPage";
import {PasswordChangePage} from "./page/PasswordChangePage";
import {HelpPage} from "./page/HelpPage/HelpPage";
import {AppGuide} from "./page/AppGuide/AppGuide";
import {FAQ} from "./page/FAQ";
import {AddedBorschesPage} from "./page/AddedBorschesPage";
import { Auth } from "./page/Auth";
import { AppProvider } from "./context/AppProvider";
import { I18nProvider } from "./i18n";
import { FilterUrlSync } from "./components/FilterUrlSync";
import { PageviewTracker } from "./components/PageviewTracker";



export default function App() {   
  return (
    <I18nProvider>
    <AppProvider>
      <BrowserRouter>
      <Layout>              
          <FilterUrlSync />              
          <PageviewTracker />
          <Routes>          
            <Route path="/" element={<MapPage />} />
            <Route path="/list" element={<ListPage />} />           
            <Route path="/register" element={<Auth />} />
            <Route path="/login" element={<Auth />} />
            <Route path="/borsch/:borschId" element={<BorschPage />} />
            <Route path="/favorite" element={<PrivateRoute><LikeBorsch /></PrivateRoute>} />
            <Route path="/reviews" element={<PrivateRoute><List /></PrivateRoute>} />
            <Route path="/add-borsch" element={<AddPage />} />
            <Route path="/add-borsch/select-place" element={<SelectPlacePage />} />
            <Route path="/add-borsch/select-place/:borschId" element={<AddBorschFlow />} />
            <Route path="/borsch/:borschId/evaluations" element={<EvaluationsPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/personal-information" element={<PersonalInfo />} />
            <Route path="/profile/added-borsches" element={<AddedBorschesPage />} />
            <Route path="/profile/change-password" element={<PasswordChangePage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/app-guide" element={<AppGuide />} />
            {/*<Route path="/profile/password" element={<UserPasswordPage/>}/>*/}            
          </Routes>
      </Layout>
    </BrowserRouter> 
    </AppProvider>
    </I18nProvider>        
  );
}


