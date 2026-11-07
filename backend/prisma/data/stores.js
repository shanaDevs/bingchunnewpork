"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BINGCHUN_STORES = void 0;
exports.storeIdFromName = storeIdFromName;
exports.storeIdCandidates = storeIdCandidates;
exports.isDeliveryEnabledStore = isDeliveryEnabledStore;
/** Canonical Bing Chun branches — names/addresses from bingchunsrilanka.lk, coordinates from Google Maps listings. */
exports.BINGCHUN_STORES = [
    // Colombo District
    { name: 'Bing Chun - Bambalapitiya', addressLine: '481 Galle - Colombo Rd, Colombo 00300', city: 'Bambalapitiya', district: 'Colombo', lat: 6.896192, lng: 79.854717, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Battaramulla', addressLine: '182 Main St, Battaramulla 10120', city: 'Battaramulla', district: 'Colombo', lat: 6.901947, lng: 79.919298, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Baththaramulla'] },
    { name: 'Bing Chun - Borella', addressLine: 'No. 18, Dr N. M. Perera Mawatha, Colombo 00800', city: 'Borella', district: 'Colombo', lat: 6.914197, lng: 79.878178, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Dehiwala', addressLine: '63a A2, Dehiwala-Mount Lavinia', city: 'Dehiwala', district: 'Colombo', lat: 6.859233, lng: 79.864639, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Dehiwala 1'] },
    { name: 'Bing Chun - Dehiwala N20', addressLine: '191, 1 Galle Rd, Dehiwala-Mount Lavinia 10350', city: 'Dehiwala', district: 'Colombo', lat: 6.844354, lng: 79.866437, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Dehiwala 2'] },
    { name: 'Bing Chun - Duplication Road', addressLine: '347 R. A. De Mel Mawatha, Colombo 00300', city: 'Colombo', district: 'Colombo', lat: 6.905123, lng: 79.853878, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Grandpass', addressLine: '3A St. Joseph\'s St, Colombo 01400', city: 'Colombo', district: 'Colombo', lat: 6.946742, lng: 79.871609, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Havelock', addressLine: 'Rd Havelock Rd, Colombo 00500', city: 'Colombo', district: 'Colombo', lat: 6.888286, lng: 79.864344, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Havelock 1'] },
    { name: 'Bing Chun - Havelock 2', addressLine: 'Sri Sambuddhathva Jayanthi Mawatha, Colombo 00500', city: 'Colombo', district: 'Colombo', lat: 6.878056, lng: 79.869334, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Homagama', addressLine: 'No. 65/A High Level Rd, Homagama', city: 'Homagama', district: 'Colombo', lat: 6.84092, lng: 80.000869, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kaduwela', addressLine: '482/3/A Avissawella Rd, Kaduwela', city: 'Kaduwela', district: 'Colombo', lat: 6.936804, lng: 79.981341, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kohuwala', addressLine: '173 Dutugemunu St, Nugegoda 10250', city: 'Kohuwala', district: 'Colombo', lat: 6.86831, lng: 79.883685, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kollupitiya', addressLine: '380 Galle Rd, Colombo', city: 'Kollupitiya', district: 'Colombo', lat: 6.907071, lng: 79.850862, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kothalawala', addressLine: 'WX9F+3HC, New Kandy Rd, Malabe', city: 'Malabe', district: 'Colombo', lat: 6.916259, lng: 79.972233, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kottawa', addressLine: '138, 1G High Level Rd, Pannipitiya 10230', city: 'Pannipitiya', district: 'Colombo', lat: 6.840445, lng: 79.966829, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Maharagama', addressLine: '134/B High Level Rd, Maharagama 10280', city: 'Maharagama', district: 'Colombo', lat: 6.847397, lng: 79.926586, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Malabe', addressLine: '760, Malabe 10115', city: 'Malabe', district: 'Colombo', lat: 6.904367, lng: 79.95335, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Malambe'] },
    { name: 'Bing Chun - Maradana', addressLine: '152 A Baddegama Wimalawansa Himi Mawatha, Colombo 01000', city: 'Maradana', district: 'Colombo', lat: 6.924648, lng: 79.864939, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Moratuwa', addressLine: 'Moratuwa', city: 'Moratuwa', district: 'Colombo', lat: 6.776809, lng: 79.883381, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Mount Lavinia', addressLine: '8 Galle Rd, Dehiwala-Mount Lavinia 10350', city: 'Mount Lavinia', district: 'Colombo', lat: 6.831542, lng: 79.867442, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Mt. Lavinia'] },
    { name: 'Bing Chun - Nugegoda', addressLine: '205 Stanley Tilakaratne Mawatha, Nugegoda', city: 'Nugegoda', district: 'Colombo', lat: 6.875611, lng: 79.892331, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Pannipitiya', addressLine: '329/1/A High Level Rd, Pannipitiya 10230', city: 'Pannipitiya', district: 'Colombo', lat: 6.84548, lng: 79.953333, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Piliyandala', addressLine: 'Bus Stop, Piliyandala', city: 'Piliyandala', district: 'Colombo', lat: 6.800642, lng: 79.923843, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Pitakotte', addressLine: '159d Pagoda Rd, Sri Jayawardenepura Kotte 10100', city: 'Pitakotte', district: 'Colombo', lat: 6.884157, lng: 79.901495, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Port City Food Court', addressLine: '07 Plot, The Food Harbour, Unit, No 1/01 11 Chaithya Rd, Port City Colombo 00100', city: 'Colombo', district: 'Colombo', lat: 6.931992, lng: 79.839569, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Punchi Borella', addressLine: '816 Maradana Rd, Colombo 01000', city: 'Punchi Borella', district: 'Colombo', lat: 6.921868, lng: 79.87048, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Rajagiriya', addressLine: 'Rajagiriya, Sri Jayawardenepura Kotte', city: 'Rajagiriya', district: 'Colombo', lat: 6.90692, lng: 79.902078, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Ratmalana', addressLine: '306 Galle Rd, Dehiwala-Mount Lavinia 10390', city: 'Ratmalana', district: 'Colombo', lat: 6.82205, lng: 79.871606, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Rathmalana'] },
    { name: 'Bing Chun - Rawathawatte', addressLine: '623c Galle Rd, Moratuwa 10400', city: 'Moratuwa', district: 'Colombo', lat: 6.786433, lng: 79.8848, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Union Place', addressLine: '147 Justice Akbar Mawatha, Colombo 00200', city: 'Colombo', district: 'Colombo', lat: 6.923598, lng: 79.851516, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Wellawatta', addressLine: '380 Galle Rd, Colombo 00600', city: 'Colombo', district: 'Colombo', lat: 6.876332, lng: 79.860582, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Gampaha District
    { name: 'Bing Chun - Browns Beach', addressLine: '15 Porutota Rd, Negombo 11500', city: 'Negombo', district: 'Gampaha', lat: 7.236775, lng: 79.841253, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Enderamulla', addressLine: '141/A Dalupitiya Rd, Wattala 11300', city: 'Enderamulla', district: 'Gampaha', lat: 6.996435, lng: 79.919117, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Gampaha', addressLine: '25/A Ranathunga Rd, Gampaha', city: 'Gampaha', district: 'Gampaha', lat: 7.091972, lng: 79.993494, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Ja-Ela', addressLine: '92 Negombo Rd, Ja-Ela 11350', city: 'Ja-Ela', district: 'Gampaha', lat: 7.083097, lng: 79.891276, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kadawatha', addressLine: '151/4 Kandy Rd, Kadawatha 11850', city: 'Kadawatha', district: 'Gampaha', lat: 7.00439, lng: 79.956422, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kelaniya', addressLine: '73,Kandy road Dalugama Kelaniya, Kiribathgoda 11600', city: 'Kelaniya', district: 'Gampaha', lat: 6.973678, lng: 79.920266, phone: '+94 77 833 3833', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kochchikade', addressLine: '15 Chilaw - Colombo Main Rd, Negombo 11540', city: 'Kochchikade', district: 'Gampaha', lat: 7.265058, lng: 79.859041, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Minuwangoda', addressLine: 'Hadirama Junction (Opp. Dominos, Airport Road, Minuwangoda 11550', city: 'Minuwangoda', district: 'Gampaha', lat: 7.170136, lng: 79.944786, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Mirigama', addressLine: 'No. 51/A Giriulla - Pasyala Rd, Mirigama', city: 'Mirigama', district: 'Gampaha', lat: 7.246785, lng: 80.129234, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Negombo', addressLine: '315/E Main St, Negombo 11500', city: 'Negombo', district: 'Gampaha', lat: 7.211988, lng: 79.842117, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Negombo 2', addressLine: '142 Negombo - Colombo Main Rd, Negombo 11500', city: 'Negombo', district: 'Gampaha', lat: 7.211519, lng: 79.848328, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Nittambuwa', addressLine: '43VW+4MF, Nittambuwa', city: 'Nittambuwa', district: 'Gampaha', lat: 7.142796, lng: 80.096696, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Peliyagoda', addressLine: '491 Kandy Rd, Peliyagoda 11830', city: 'Peliyagoda', district: 'Gampaha', lat: 6.958858, lng: 79.890786, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Ragama', addressLine: '20c Mahabage Road, Ragama', city: 'Ragama', district: 'Gampaha', lat: 7.02776, lng: 79.918624, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Wattala', addressLine: '195 Negombo Rd, Wattala 11300', city: 'Wattala', district: 'Gampaha', lat: 6.981435, lng: 79.887863, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Kalutara District
    { name: 'Bing Chun - Aluthgama', addressLine: 'No 135 Agalawatte road, Aluthgama 12080', city: 'Aluthgama', district: 'Kalutara', lat: 6.434545, lng: 80.00042, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Horana', addressLine: 'Horana, Kalutara', city: 'Horana', district: 'Kalutara', lat: 6.717964, lng: 80.068125, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Kalutara', addressLine: '195 Galle Rd, Kalutara 12000', city: 'Kalutara', district: 'Kalutara', lat: 6.580365, lng: 79.96209, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Mathugama', addressLine: 'N0, 35 Agalawatta - Matugama Rd, Matugama 12100', city: 'Matugama', district: 'Kalutara', lat: 6.522876, lng: 80.114715, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Panadura', addressLine: '11 Horana Rd, Panadura 12500', city: 'Panadura', district: 'Kalutara', lat: 6.712539, lng: 79.908283, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Panadura 2', addressLine: 'Main St, Panadura 12500', city: 'Panadura', district: 'Kalutara', lat: 6.724448, lng: 79.90702, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Kandy District
    { name: 'Bing Chun - Kandy', addressLine: '40 DS Senanayake Veediya, Kandy 20000', city: 'Kandy', district: 'Kandy', lat: 7.294447, lng: 80.638284, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00', legacyNames: ['Bing Chun - Kandy City'] },
    { name: 'Bing Chun - Peradeniya', addressLine: '392 peradeniya Kandy Rd, Kandy 20400', city: 'Kandy', district: 'Kandy', lat: 7.284843, lng: 80.624695, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Kurunegala District
    { name: 'Bing Chun - Kurunegala', addressLine: '198 Kandy Rd, Kurunegala 60000', city: 'Kurunegala', district: 'Kurunegala', lat: 7.482357, lng: 80.367961, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Kegalle District
    { name: 'Bing Chun - Kegalle', addressLine: '245 Kandy - Colombo Rd, Kegalle', city: 'Kegalle', district: 'Kegalle', lat: 7.253475, lng: 80.346814, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Ratnapura District
    { name: 'Bing Chun - Balangoda', addressLine: 'No 138 Main St, Balangoda', city: 'Balangoda', district: 'Ratnapura', lat: 6.650231, lng: 80.699462, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Embilipitiya', addressLine: 'No 14, Pallegama, Embilipitiya 70200', city: 'Embilipitiya', district: 'Ratnapura', lat: 6.332731, lng: 80.855108, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Ratnapura', addressLine: 'Ratnapura', city: 'Ratnapura', district: 'Ratnapura', lat: 6.680475, lng: 80.402464, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Puttalam District
    { name: 'Bing Chun - Chilaw', addressLine: 'HQGW+M2C, Bazaar St, Chilaw', city: 'Chilaw', district: 'Puttalam', lat: 7.576654, lng: 79.794924, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Dankotuwa', addressLine: 'No.52 Pannala Rd, Dankotuwa', city: 'Dankotuwa', district: 'Puttalam', lat: 7.297169, lng: 79.883149, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Wennappuwa', addressLine: 'Wennappuwa, Puttalam', city: 'Wennappuwa', district: 'Puttalam', lat: 7.337473, lng: 79.843247, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Galle District
    { name: 'Bing Chun - Ambalangoda', addressLine: 'no.3/2 Kularatne Rd, Ambalangoda', city: 'Ambalangoda', district: 'Galle', lat: 6.239121, lng: 80.054159, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Galle', addressLine: '61 Sea street, Galle 80000', city: 'Galle', district: 'Galle', lat: 6.034811, lng: 80.219664, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    { name: 'Bing Chun - Hikkaduwa', addressLine: 'Hikkaduwa, Galle', city: 'Hikkaduwa', district: 'Galle', lat: 6.142343, lng: 80.099844, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Matara District
    { name: 'Bing Chun - Matara', addressLine: '79 Kumarathunga Mawatha, Matara', city: 'Matara', district: 'Matara', lat: 5.947677, lng: 80.543526, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
    // Not yet on the public store finder; keep existing Pepiliyana LAUGFS outlet
    { name: 'Bing Chun - Pepiliyana', addressLine: 'LAUGFS Supermarket, Pepiliyana', city: 'Pepiliyana', district: 'Colombo', lat: 6.8712, lng: 79.8921, phone: '+94 76 546 6686', openTime: '08:00', closeTime: '23:00' },
];
function storeIdFromName(name) {
    return `store-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
}
function storeIdCandidates(store) {
    return [store.name, ...(store.legacyNames ?? [])].map(storeIdFromName);
}
/** All Bing Chun branches support delivery in the app. */
function isDeliveryEnabledStore(_storeId) {
    return true;
}
//# sourceMappingURL=stores.js.map