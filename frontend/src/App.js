import { lazy, Suspense } from "react";
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
import { BowlFlow } from "./page/BowlFlow";
import { BowlRatePage } from "./page/BowlRatePage";
// import {UserPasswordPage} from "./page/UserPasswordPage";
import {PasswordChangePage} from "./page/PasswordChangePage";
import {HelpPage} from "./page/HelpPage/HelpPage";
import {AppGuide} from "./page/AppGuide/AppGuide";
import {FAQ} from "./page/FAQ";
import {AddedBorschesPage} from "./page/AddedBorschesPage";
import { NotFound } from "./page/NotFound";
import { Auth } from "./page/Auth";
import { AppProvider } from "./context/AppProvider";
import { I18nProvider } from "./i18n";
import { FilterUrlSync } from "./components/FilterUrlSync";
import { PageviewTracker } from "./components/PageviewTracker";
import { EmptyState } from "./components/EmptyState";

// «Стіл» (stage 2) is a screen most visitors of the map never open: its pages,
// the QR code and the story picture load only when a table link is followed.
const TableCreate = lazy(() => import("./page/TableCreate").then((m) => ({ default: m.TableCreate })));
const TablePage = lazy(() => import("./page/TablePage").then((m) => ({ default: m.TablePage })));
// «Я знаю, тут є Борщ» (stage 3): a short flow most visitors never open either
const TipFlow = lazy(() => import("./page/TipFlow").then((m) => ({ default: m.TipFlow })));
const tableScreen = (element) => (
  <Suspense fallback={<EmptyState loading />}>{element}</Suspense>
);



export default function App() {   
  return (
    <I18nProvider>
    <AppProvider>
      <BrowserRouter>
      {/* Лічильник переглядів стоїть ПОЗА Layout навмисно. На десктопі Layout
          для «/», «/borsch/:id» і «/borsch/:id/evaluations» малює власний
          split-вигляд і не рендерить children взагалі — тобто все, що лежить
          усередині, на трьох найголовніших екранах апки просто зникає.
          Так ми й втратили перегляди десктопних відвідувачів у день лончу:
          кліки приходили, $pageview — ні. */}
      <PageviewTracker />
      <Layout>              
          <FilterUrlSync />              
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
            {/* Оцінка Борщу 2.0: a bowl, brought now and rated after the meal */}
            <Route path="/bowl/new" element={<BowlFlow />} />
            <Route path="/bowl/:bowlId/rate" element={<BowlRatePage />} />
            {/* Оцінка Борщу 2.0, stage 2: «Стіл», a host and a QR, guests rate the taste */}
            <Route path="/table/new" element={tableScreen(<TableCreate />)} />
            <Route path="/t/:code" element={tableScreen(<TablePage />)} />
            {/* Оцінка Борщу 2.0, stage 3: «Я знаю, тут є Борщ», a grey bowl on the map */}
            <Route path="/tip/new" element={tableScreen(<TipFlow />)} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/personal-information" element={<PersonalInfo />} />
            <Route path="/profile/added-borsches" element={<AddedBorschesPage />} />
            <Route path="/profile/change-password" element={<PasswordChangePage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/app-guide" element={<AppGuide />} />
            {/*<Route path="/profile/password" element={<UserPasswordPage/>}/>*/}
            {/* Unknown paths used to render nothing at all. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
      </Layout>
    </BrowserRouter> 
    </AppProvider>
    </I18nProvider>        
  );
}


