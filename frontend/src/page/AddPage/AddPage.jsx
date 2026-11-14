import {MapPage} from "../MapPage";
import { useFlowTracking } from "../../hook/useFlowTracking";
import { addFlowTotal } from "../AddBorschFlow/AddBorschFlow";

// The first screen of adding a borshch: the venue, tapped on the map or found
// by search. Counted as step 0 of the add flow (services/flowAnalytics); the
// sheet that picks the venue hands over to the address check.
export const AddPage=()=>{
  useFlowTracking({ flow: 'add', step: 'place', index: 0, total: addFlowTotal(), context: { entry: 'map' } });
  return( 
    <>      
      <MapPage/>
    </>      
  )   
}
