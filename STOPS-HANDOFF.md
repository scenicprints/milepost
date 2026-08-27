# Milepost — the stop list as it stands, and what a replacement has to fit

> **SUPERSEDED, session 17.** The replacement pool landed. Leg 1 in
> `data/stops.json` is now the researched pool, not the placeholder list this
> file describes. The contract in half two is still the law for leg 2 and
> leg 3 pools.

This is a handoff. Two halves: **what is in the app today**, which Kevin never
approved and treats as a placeholder, and **the contract a replacement list has
to satisfy** so it drops straight in without touching code.

---

## The trip

Modesto CA -> North Carolina (Christmas) -> Houston TX (New Year) -> home.
About 5,890 miles over 21 driving days, in late December.
Two people: Kevin, and Ada, who has never been outside California.

| | |
|---|---|
| Car | 2023 Honda Accord Hybrid EX-L, **FWD**, all-season touring tires (not 3PMSF), low clearance |
| Season | Late December. Chain control in California, I-40 closures at Flagstaff, ice from Amarillo east |
| Phones | Kevin Android, Ada iPhone — it is a web app for that reason |
| Offline | Non-negotiable. Long dead stretches in the Mojave, AZ/NM and West Texas |
| Repo | **Public.** Dates, overnight towns, personal notes and the sync code must never appear in the data |

**Three legs, two route options each.** A stop names the route ids it sits on,
so swapping a route swaps its stops.

| Leg | Route id | Name | Miles | Waypoints |
|---|---|---|---:|---:|
| leg1 — Modesto to North Carolina | `leg1-i40` | The Route 66 road | 2,771 | 29 |
| leg1 — Modesto to North Carolina | `leg1-low` | The low road | 2,984 | 24 |
| leg2 — North Carolina to Houston | `leg2-gulf` | The Gulf Coast | 1,221 | 12 |
| leg2 — North Carolina to Houston | `leg2-inland` | The inland run | 1,455 | 11 |
| leg3 — Houston to Modesto | `leg3-i10` | The desert road | 1,898 | 15 |
| leg3 — Houston to Modesto | `leg3-vegas` | Up through Vegas | 1,960 | 18 |

---

## Half one — the 68 stops in the app today

Ordered by where they fall along each route. `Detour` is minutes **one way**
off the interstate; the app doubles it and adds `dwell`, and `Costs you` is
that total. A stop can appear under more than one route.

### `leg1-i40` — The Route 66 road · 2,771 mi · 36 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 242 | Tehachapi Loop | Keene, CA | 12 | 30 | 54m | Free | — | roadside trains |
| 342 | Route 66 Mother Road Museum | Barstow, CA | 5 | 45 | 55m | Free | winter | route66 |
| 352 | Calico Ghost Town | Barstow, CA | 10 | 120 | 2h 20m | $8 | winter | history kids |
| 423 | Kelso Dunes, Mojave National Preserve | Kelso, CA | 35 | 120 | 3h 10m | Free | winter | nationalpark view |
| 510 | Oatman | Oatman, AZ | 45 | 90 | 3h | Free | winter | route66 animals |
| 607 | Seligman | Seligman, AZ | 8 | 45 | 1h 1m | Free | — | route66 |
| 646 | Grand Canyon, South Rim | Grand Canyon Village, AZ | 60 | 180 | 5h | $35/vehicle | first, big, winter | nationalpark view |
| 652 | Bearizona | Williams, AZ | 5 | 120 | 2h 10m | $35 | winter | animals |
| 682 | Lowell Observatory | Flagstaff, AZ | 10 | 120 | 2h 20m | $29 | first, winter | night science |
| 689 | Sunset Crater & Wupatki | Flagstaff, AZ | 25 | 150 | 3h 20m | $25/vehicle | winter | nationalpark volcano |
| 724 | Meteor Crater | Winslow, AZ | 6 | 90 | 1h 42m | $29 | first, winter | science view |
| 743 | Standin' on the Corner Park | Winslow, AZ | 4 | 20 | 28m | Free | — | route66 quick |
| 778 | Wigwam Motel | Holbrook, AZ | 5 | 15 | 25m | Free to look | — | route66 sleep |
| 797 | Petrified Forest & Painted Desert | Holbrook, AZ | 5 | 150 | 2h 40m | $25/vehicle | first, big, winter | nationalpark view |
| 910 | El Morro National Monument | Ramah, NM | 40 | 90 | 2h 50m | Free | winter | history |
| 1,008 | Old Town Albuquerque | Albuquerque, NM | 10 | 120 | 2h 20m | Free | winter | food history |
| 1,021 | Sandia Peak Tramway | Albuquerque, NM | 20 | 150 | 3h 10m | $29 | first, big, winter | view ride |
| 1,193 | Blue Swallow Motel & Tucumcari neon | Tucumcari, NM | 5 | 30 | 40m | Free | — | route66 night |
| 1,300 | Cadillac Ranch | Amarillo, TX | 5 | 40 | 50m | Free | first, winter | roadside quick |
| 1,314 | The Big Texan Steak Ranch | Amarillo, TX | 3 | 90 | 1h 36m | $$ | — | food |
| 1,317 | Palo Duro Canyon | Canyon, TX | 40 | 150 | 3h 50m | $8/person | first, winter | view hike |
| 1,576 | Oklahoma City National Memorial | Oklahoma City, OK | 6 | 75 | 1h 27m | Free outdoors | winter | history |
| 1,587 | POPS 66 Soda Ranch | Arcadia, OK | 15 | 45 | 1h 15m | $ | — | route66 food |
| 1,868 | Hot Springs National Park | Hot Springs, AR | 55 | 150 | 4h 20m | Free park | winter | nationalpark |
| 1,905 | Little Rock Central High School | Little Rock, AR | 10 | 60 | 1h 20m | Free | winter | history |
| 2,043 | Crossing the Mississippi | Memphis, TN | 0 | 5 | 5m | Free | first | quick view |
| 2,046 | National Civil Rights Museum | Memphis, TN | 8 | 180 | 3h 16m | $18 | big, winter | history |
| 2,047 | Beale Street | Memphis, TN | 8 | 150 | 2h 46m | Free | — | music food night |
| 2,047 | Graceland | Memphis, TN | 15 | 180 | 3h 30m | $85 | big, winter | music |
| 2,048 | Sun Studio | Memphis, TN | 8 | 60 | 1h 16m | $18 | — | music |
| 2,262 | Broadway | Nashville, TN | 8 | 180 | 3h 16m | Free | — | music night |
| 2,262 | Ryman Auditorium | Nashville, TN | 8 | 75 | 1h 31m | $32 | — | music |
| 2,463 | Dollywood | Pigeon Forge, TN | 40 | 300 | 6h 20m | $99 | winter | kids |
| 2,473 | Great Smoky Mountains — Newfound Gap | Gatlinburg, TN | 45 | 150 | 4h | Free park | first, winter | nationalpark view |
| 2,524 | Biltmore Estate | Asheville, NC | 12 | 240 | 4h 24m | $90+ | big, winter | history |
| 2,543 | Mount Mitchell | Burnsville, NC | 50 | 90 | 3h 10m | Free | winter | view |

### `leg1-low` — The low road · 2,984 mi · 25 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 424 | Palm Springs Aerial Tramway | Palm Springs, CA | 20 | 150 | 3h 10m | $30 | winter | view ride |
| 475 | Joshua Tree National Park | Cottonwood, CA | 10 | 120 | 2h 20m | $30/vehicle | winter | nationalpark view |
| 715 | Desert Botanical Garden | Phoenix, AZ | 15 | 120 | 2h 30m | $30 | winter | garden |
| 817 | Saguaro National Park | Tucson, AZ | 25 | 120 | 2h 50m | $25/vehicle | winter | nationalpark view |
| 833 | Pima Air & Space Museum | Tucson, AZ | 10 | 180 | 3h 20m | $22 | winter | museum |
| 883 | Tombstone | Tombstone, AZ | 45 | 150 | 4h | $ | winter | history |
| 1,094 | White Sands National Park | Alamogordo, NM | 50 | 180 | 4h 40m | $25/vehicle | first, big, winter | nationalpark view |
| 1,137 | Scenic Drive Overlook | El Paso, TX | 15 | 40 | 1h 10m | Free | winter | view |
| 1,313 | Carlsbad Caverns | Carlsbad, NM | 110 | 240 | 7h 40m | $15/person | first, big, winter | cave nationalpark |
| 1,319 | Balmorhea State Park | Toyahvale, TX | 12 | 60 | 1h 24m | $7 | winter | water |
| 1,756 | Fort Worth Stockyards | Fort Worth, TX | 15 | 120 | 2h 30m | Free | — | history food |
| 1,790 | The Sixth Floor Museum | Dallas, TX | 10 | 120 | 2h 20m | $24 | winter | history |
| 2,072 | Hot Springs National Park | Hot Springs, AR | 55 | 150 | 4h 20m | Free park | winter | nationalpark |
| 2,118 | Little Rock Central High School | Little Rock, AR | 10 | 60 | 1h 20m | Free | winter | history |
| 2,255 | Crossing the Mississippi | Memphis, TN | 0 | 5 | 5m | Free | first | quick view |
| 2,259 | National Civil Rights Museum | Memphis, TN | 8 | 180 | 3h 16m | $18 | big, winter | history |
| 2,260 | Beale Street | Memphis, TN | 8 | 150 | 2h 46m | Free | — | music food night |
| 2,260 | Graceland | Memphis, TN | 15 | 180 | 3h 30m | $85 | big, winter | music |
| 2,261 | Sun Studio | Memphis, TN | 8 | 60 | 1h 16m | $18 | — | music |
| 2,474 | Broadway | Nashville, TN | 8 | 180 | 3h 16m | Free | — | music night |
| 2,474 | Ryman Auditorium | Nashville, TN | 8 | 75 | 1h 31m | $32 | — | music |
| 2,676 | Dollywood | Pigeon Forge, TN | 40 | 300 | 6h 20m | $99 | winter | kids |
| 2,686 | Great Smoky Mountains — Newfound Gap | Gatlinburg, TN | 45 | 150 | 4h | Free park | first, winter | nationalpark view |
| 2,737 | Biltmore Estate | Asheville, NC | 12 | 240 | 4h 24m | $90+ | big, winter | history |
| 2,756 | Mount Mitchell | Burnsville, NC | 50 | 90 | 3h 10m | Free | winter | view |

### `leg2-gulf` — The Gulf Coast · 1,221 mi · 9 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 141 | NASCAR Hall of Fame | Charlotte, NC | 6 | 120 | 2h 12m | $28 | — | museum |
| 389 | MLK National Historical Park | Atlanta, GA | 10 | 120 | 2h 20m | Free | winter | history |
| 390 | Georgia Aquarium | Atlanta, GA | 10 | 180 | 3h 20m | $45 | first, winter | animals |
| 550 | Legacy Museum & National Memorial for Peace and Justice | Montgomery, AL | 8 | 210 | 3h 46m | $5 | big, winter | history |
| 718 | USS Alabama Battleship | Mobile, AL | 4 | 150 | 2h 38m | $18 | — | museum |
| 718 | First look at the Gulf | Gulf Shores, AL | 45 | 60 | 2h 30m | Free | first, winter | view beach |
| 861 | The French Quarter | New Orleans, LA | 15 | 300 | 5h 30m | Free | first, big, winter | food music night |
| 906 | Oak Alley Plantation | Vacherie, LA | 35 | 120 | 3h 10m | $28 | — | history |
| 1,209 | Space Center Houston | Houston, TX | 25 | 240 | 4h 50m | $30 | first, big, winter | science |

### `leg2-inland` — The inland run · 1,455 mi · 7 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 141 | NASCAR Hall of Fame | Charlotte, NC | 6 | 120 | 2h 12m | $28 | — | museum |
| 389 | MLK National Historical Park | Atlanta, GA | 10 | 120 | 2h 20m | Free | winter | history |
| 391 | Georgia Aquarium | Atlanta, GA | 10 | 180 | 3h 20m | $45 | first, winter | animals |
| 544 | Birmingham Civil Rights Institute | Birmingham, AL | 8 | 150 | 2h 46m | $15 | big, winter | history |
| 828 | Vicksburg National Military Park | Vicksburg, MS | 12 | 150 | 2h 54m | $20/vehicle | winter | history |
| 1,207 | The Sixth Floor Museum | Dallas, TX | 10 | 120 | 2h 20m | $24 | winter | history |
| 1,455 | Space Center Houston | Houston, TX | 25 | 240 | 4h 50m | $30 | first, big, winter | science |

### `leg3-i10` — The desert road · 1,898 mi · 16 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 194 | Natural Bridge Caverns | San Antonio, TX | 25 | 120 | 2h 50m | $32 | winter | cave |
| 206 | The Alamo | San Antonio, TX | 8 | 90 | 1h 46m | Free | — | history |
| 206 | San Antonio River Walk | San Antonio, TX | 8 | 180 | 3h 16m | Free | first, big, winter | food night view |
| 571 | Balmorhea State Park | Toyahvale, TX | 12 | 60 | 1h 24m | $7 | winter | water |
| 576 | Marfa Lights Viewing Area | Marfa, TX | 60 | 60 | 3h | Free | winter | night roadside |
| 621 | Carlsbad Caverns | Carlsbad, NM | 110 | 240 | 7h 40m | $15/person | first, big, winter | cave nationalpark |
| 760 | Scenic Drive Overlook | El Paso, TX | 15 | 40 | 1h 10m | Free | winter | view |
| 804 | White Sands National Park | Alamogordo, NM | 50 | 180 | 4h 40m | $25/vehicle | first, big, winter | nationalpark view |
| 1,014 | Tombstone | Tombstone, AZ | 45 | 150 | 4h | $ | winter | history |
| 1,065 | Pima Air & Space Museum | Tucson, AZ | 10 | 180 | 3h 20m | $22 | winter | museum |
| 1,080 | Saguaro National Park | Tucson, AZ | 25 | 120 | 2h 50m | $25/vehicle | winter | nationalpark view |
| 1,183 | Desert Botanical Garden | Phoenix, AZ | 15 | 120 | 2h 30m | $30 | winter | garden |
| 1,398 | Salvation Mountain | Niland, CA | 40 | 60 | 2h 20m | Free | winter | roadside art |
| 1,422 | Joshua Tree National Park | Cottonwood, CA | 10 | 120 | 2h 20m | $30/vehicle | winter | nationalpark view |
| 1,473 | Palm Springs Aerial Tramway | Palm Springs, CA | 20 | 150 | 3h 10m | $30 | winter | view ride |
| 1,583 | Griffith Observatory | Los Angeles, CA | 25 | 120 | 2h 50m | Free | winter | view night science |

### `leg3-vegas` — Up through Vegas · 1,960 mi · 16 stops

| Mi | Stop | Town | Detour | Dwell | Costs you | Money | Flags | Tags |
|---:|---|---|---:|---:|---:|---|---|---|
| 194 | Natural Bridge Caverns | San Antonio, TX | 25 | 120 | 2h 50m | $32 | winter | cave |
| 206 | The Alamo | San Antonio, TX | 8 | 90 | 1h 46m | Free | — | history |
| 206 | San Antonio River Walk | San Antonio, TX | 8 | 180 | 3h 16m | Free | first, big, winter | food night view |
| 571 | Balmorhea State Park | Toyahvale, TX | 12 | 60 | 1h 24m | $7 | winter | water |
| 576 | Marfa Lights Viewing Area | Marfa, TX | 60 | 60 | 3h | Free | winter | night roadside |
| 621 | Carlsbad Caverns | Carlsbad, NM | 110 | 240 | 7h 40m | $15/person | first, big, winter | cave nationalpark |
| 760 | Scenic Drive Overlook | El Paso, TX | 15 | 40 | 1h 10m | Free | winter | view |
| 804 | White Sands National Park | Alamogordo, NM | 50 | 180 | 4h 40m | $25/vehicle | first, big, winter | nationalpark view |
| 1,014 | Tombstone | Tombstone, AZ | 45 | 150 | 4h | $ | winter | history |
| 1,065 | Pima Air & Space Museum | Tucson, AZ | 10 | 180 | 3h 20m | $22 | winter | museum |
| 1,080 | Saguaro National Park | Tucson, AZ | 25 | 120 | 2h 50m | $25/vehicle | winter | nationalpark view |
| 1,183 | Desert Botanical Garden | Phoenix, AZ | 15 | 120 | 2h 30m | $30 | winter | garden |
| 1,442 | Hoover Dam | Boulder City, NV | 15 | 120 | 2h 30m | $10 parking | first, big, winter | history view |
| 1,474 | The Strip | Las Vegas, NV | 10 | 240 | 4h 20m | Free to walk | first, winter | night |
| 1,493 | Seven Magic Mountains | Jean, NV | 8 | 30 | 46m | Free | — | art roadside quick |
| 1,558 | Kelso Dunes, Mojave National Preserve | Kelso, CA | 35 | 120 | 3h 10m | Free | winter | nationalpark view |

### What the flags mean

- **first** — there is no California version of this. Ada has never left the
  state, and the app counts these separately on the Trip tab. Use it sparingly
  or it stops meaning anything.
- **big** — a headline stop. Affects exactly two things: it wins the space when
  map labels collide, and it is picked first when the app seeds a fresh plan.
- **winter** — a caveat that only applies in the cold half of the year.

### Every stop, with its reasoning

The `why` text is what shows in the place sheet. It is the part worth rewriting
hardest — it is the only argument for spending the time.

**Tehachapi Loop** — Keene, CA · `tehachapi-loop` · on `leg1-i40`

> A freight train long enough to cross over the top of its own tail. It has been doing this since 1876 and it is still the thing railroad people drive across the country to watch.

**Calico Ghost Town** — Barstow, CA · `calico` · on `leg1-i40`

> A silver town that died in 1907 and got rebuilt as itself. Good legs-stretch two hours into the drive.

> *Winter:* Cold and windy in December. Open year round.

**Route 66 Mother Road Museum** — Barstow, CA · `route66-museum` · on `leg1-i40`

> Where the Route 66 thread starts. You'll be crossing and re-crossing the old road for the next 1,500 miles.

> *Winter:* Closed Mon–Tue.

**Oatman** — Oatman, AZ · `oatman` · on `leg1-i40`

> Wild burros walk down the middle of the street and expect to be fed. The old Route 66 alignment to get there is a genuinely twisty mountain road.

> *Winter:* The road over Sitgreaves Pass is narrow with no guardrail. Skip it in bad weather.

**Seligman** — Seligman, AZ · `seligman` · on `leg1-i40`

> The town that talked Arizona into preserving Route 66, and the one Pixar's Radiator Springs was drawn from. Two blocks long, entirely made of it.

**Grand Canyon, South Rim** — Grand Canyon Village, AZ · `grand-canyon` · on `leg1-i40`

> There is nothing to say about this one. An hour north of Williams, and the single best reason the northern route exists.

> *Winter:* SOUTH rim is open all year — the North Rim is closed Dec through May. Snow on the rim in late December is normal and makes it better. Roads are plowed.

**Bearizona** — Williams, AZ · `bearizona` · on `leg1-i40`

> Drive-through wildlife park — wolves and bison walk past the car. Right at the Grand Canyon turn-off.

> *Winter:* Open year round; the drive-through loop stays open in snow.

**Lowell Observatory** — Flagstaff, AZ · `lowell` · on `leg1-i40`

> Pluto was found here, from this hill, in 1930. Evening telescope viewing at 7,000 feet in winter air is about as good as the sky gets.

> *Winter:* Open, and December nights are the clearest of the year — dress for 20°F standing still.

**Sunset Crater & Wupatki** — Flagstaff, AZ · `sunset-crater` · on `leg1-i40`

> A black volcanic cinder field that erupted around 1085, and eight hundred year old pueblos on the far side of the same loop road.

> *Winter:* The 34-mile loop road can close after snow. Check before turning off.

**Meteor Crater** — Winslow, AZ · `meteor-crater` · on `leg1-i40`

> A mile-wide hole punched in the desert 50,000 years ago, six minutes off the interstate. The cheapest astonishment-per-minute on the entire route.

> *Winter:* Open year round. Exposed and brutally windy on the rim in winter.

**Standin' on the Corner Park** — Winslow, AZ · `standin-corner` · on `leg1-i40`

> Yes, that corner. Four minutes off the freeway, takes fifteen, and you will have the song in your head until Albuquerque.

**Petrified Forest & Painted Desert** — Holbrook, AZ · `petrified-forest` · on `leg1-i40`

> The best-value stop of the whole trip: the 28-mile park road runs parallel to I-40 and drops you back on it, so most of the time isn't a detour at all. Fossil logs turned to solid quartz, and a badlands painted in bands of red and violet.

> *Winter:* Open year round, gates close around 5pm in winter — go in the morning, not at dusk.

**Wigwam Motel** — Holbrook, AZ · `wigwam-motel` · on `leg1-i40`

> Fifteen concrete teepees you can actually sleep in, built in 1950. Even if you don't stay, it's worth the photo.

**El Morro National Monument** — Ramah, NM · `el-morro` · on `leg1-i40`

> A sandstone bluff with a waterhole at its base, carved with signatures — Ancestral Puebloan petroglyphs, then Spanish conquistadors from 1605, then American cavalry. Four hundred years of people writing their name on the same rock.

> *Winter:* Trails can be icy; the inscription loop is usually walkable.

**Sandia Peak Tramway** — Albuquerque, NM · `sandia-tram` · on `leg1-i40`

> Two and a half miles of cable up the face of the mountain to 10,378 feet. On a clear day you can see 11,000 square miles of New Mexico, and Albuquerque is a grid of lights underneath you at sunset.

> *Winter:* Runs in winter. It's usually 25–30°F colder at the top than the parking lot — bring real coats.

**Old Town Albuquerque** — Albuquerque, NM · `old-town-abq` · on `leg1-i40`

> Adobe plaza from 1706, green chile on everything. Good dinner stop that isn't another interstate exit.

> *Winter:* Farolitos — paper-bag lanterns — line the whole plaza through Christmas. It is genuinely beautiful and it's happening exactly when you'd pass through.

**Blue Swallow Motel & Tucumcari neon** — Tucumcari, NM · `blue-swallow` · on `leg1-i40`

> The best surviving stretch of Route 66 neon anywhere. Only works after dark — which makes it a good reason to stop for the night here rather than push on.

**Cadillac Ranch** — Amarillo, TX · `cadillac-ranch` · on `leg1-i40`

> Ten Cadillacs buried nose-down in a field, and you are not just allowed to spray paint them, you're expected to. Buy a can in Amarillo first. This is the trip photo.

> *Winter:* Open always, it's a field. Muddy after rain — wear the shoes you don't care about.

**Palo Duro Canyon** — Canyon, TX · `palo-duro` · on `leg1-i40`

> The second largest canyon in the country, 800 feet deep, and almost nobody outside Texas knows it's there. Completely invisible until you're at the edge of it.

> *Winter:* Open year round and quiet in winter. The road to the floor is steep.

**The Big Texan Steak Ranch** — Amarillo, TX · `big-texan` · on `leg1-i40`

> The 72-ounce steak that's free if you finish it in an hour. You are not going to do that, but you should eat here anyway.

**POPS 66 Soda Ranch** — Arcadia, OK · `pops-66` · on `leg1-i40`

> A 66-foot lit soda bottle on old Route 66, and about 700 kinds of soda inside. Good lunch break outside Oklahoma City.

**Oklahoma City National Memorial** — Oklahoma City, OK · `okc-memorial` · on `leg1-i40`

> 168 empty chairs, one for each person, arranged in the footprint of the building. The outdoor memorial is free and open all the time and takes twenty minutes.

> *Winter:* Outdoor memorial open 24 hours.

**Little Rock Central High School** — Little Rock, AR · `central-high` · on `leg1-i40`, `leg1-low`

> Still a working high school, and the place nine teenagers walked into in 1957 behind the 101st Airborne. The visitor center across the street is a National Park site.

> *Winter:* Visitor center closed Christmas Day.

**Hot Springs National Park** — Hot Springs, AR · `hot-springs` · on `leg1-i40`, `leg1-low`

> A row of grand 1900s bathhouses built over natural hot springs, in the middle of a small town. You can still get in the water at two of them.

> *Winter:* A hot bath in December is the entire point.

**Graceland** — Memphis, TN · `graceland` · on `leg1-i40`, `leg1-low`

> Elvis's house, preserved exactly as 1977 left it. Expensive and completely worth it — the jungle room alone.

> *Winter:* Closed Christmas Day. Decorated for Christmas from late November, which is how he actually had it.

**Sun Studio** — Memphis, TN · `sun-studio` · on `leg1-i40`, `leg1-low`

> One small room where Elvis, Johnny Cash, Roy Orbison and Jerry Lee Lewis all recorded. Still a working studio at night. You can hold the microphone.

**National Civil Rights Museum** — Memphis, TN · `civil-rights-museum` · on `leg1-i40`, `leg1-low`

> Built around the Lorraine Motel, with Dr. King's room left as it was. One of the best museums in the country, and not a quick stop — give it a real afternoon.

> *Winter:* Closed Tuesdays.

**Beale Street** — Memphis, TN · `beale-street` · on `leg1-i40`, `leg1-low`

> Live blues coming out of every door, and barbecue. If you only do one night out on the way east, do it here.

**Crossing the Mississippi** — Memphis, TN · `mississippi-crossing` · on `leg1-i40`, `leg1-low`

> The bridge itself. Half the continent drains through the water underneath you, and there is no river in California remotely like it. Just know it's coming so you look.

**Broadway** — Nashville, TN · `broadway-nashville` · on `leg1-i40`, `leg1-low`

> Three blocks of honky-tonks, live band in every one, no cover in most. Loud and touristy and completely worth doing once.

**Ryman Auditorium** — Nashville, TN · `ryman` · on `leg1-i40`, `leg1-low`

> The mother church of country music — a former revival hall with pews for seats and famously perfect sound. Self-guided tour by day.

**Great Smoky Mountains — Newfound Gap** — Gatlinburg, TN · `smokies` · on `leg1-i40`, `leg1-low`

> The most visited national park in the country, and the road climbs to 5,046 feet at the state line. Eastern mountains look nothing like the Sierra — older, softer, and wrapped in haze.

> *Winter:* Newfound Gap Road closes with snow and ice, sometimes for days. Check nps.gov before committing. Clingmans Dome Road is closed all winter.

**Dollywood** — Pigeon Forge, TN · `dollywood` · on `leg1-i40`, `leg1-low`

> A full day, so only if the schedule has one. Its Christmas run is a genuine spectacle — several million lights.

> *Winter:* Smoky Mountain Christmas runs through early January. Closed some weekdays in winter — check the calendar.

**Biltmore Estate** — Asheville, NC · `biltmore` · on `leg1-i40`, `leg1-low`

> The largest house in America, 250 rooms, finished in 1895. At Christmas they put a 35-foot tree in the banquet hall and light the whole place by candle in the evenings.

> *Winter:* Christmas at Biltmore runs through early January and sells out — book weeks ahead. This one genuinely needs a reservation.

**Mount Mitchell** — Burnsville, NC · `mount-mitchell` · on `leg1-i40`, `leg1-low`

> 6,684 feet — the highest point anywhere east of the Mississippi. You can drive nearly to the top.

> *Winter:* Reached via the Blue Ridge Parkway, which CLOSES for ice and snow all winter. Assume it's shut and treat an open day as a gift.

**NASCAR Hall of Fame** — Charlotte, NC · `nascar-hof` · on `leg2-gulf`, `leg2-inland`

> You're driving straight past it and it's better than it sounds — the banked track display alone shows you how steep 33 degrees actually is.

**Georgia Aquarium** — Atlanta, GA · `georgia-aquarium` · on `leg2-gulf`, `leg2-inland`

> One of the largest in the world, with whale sharks — which exist in about four aquariums on earth.

> *Winter:* Book a timed ticket; the holiday week is its busiest of the year.

**MLK National Historical Park** — Atlanta, GA · `mlk-park` · on `leg2-gulf`, `leg2-inland`

> His birth home, Ebenezer Baptist where he preached, and his tomb — all on two blocks, all free.

> *Winter:* Birth home tours are first-come and limited; get there early.

**Legacy Museum & National Memorial for Peace and Justice** — Montgomery, AL · `legacy-museum` · on `leg2-gulf`

> Eight hundred hanging steel columns, one for every county where a lynching happened. The most powerful museum in the American South and it costs five dollars.

> *Winter:* Closed Tuesdays. Give it three hours or don't start.

**USS Alabama Battleship** — Mobile, AL · `uss-alabama` · on `leg2-gulf`

> A World War II battleship you walk through top to bottom, plus a submarine, four minutes off I-10.

**First look at the Gulf** — Gulf Shores, AL · `gulf-beach` · on `leg2-gulf`

> Warm, flat, pale green water and sand like sugar. Nothing about it resembles the Pacific she grew up on — and in December you'll have the beach to yourselves.

> *Winter:* Too cold to swim, perfect to walk.

**The French Quarter** — New Orleans, LA · `french-quarter` · on `leg2-gulf`

> Beignets at Café du Monde, brass bands on Royal Street, two hundred year old ironwork. There is nowhere else in the country that feels like this and it is worth an overnight, not a drive-through.

> *Winter:* You'd be here right around New Year's — which is spectacular and also means book a room early and expect crowds.

**Oak Alley Plantation** — Vacherie, LA · `oak-alley` · on `leg2-gulf`

> A quarter-mile corridor of 300-year-old live oaks, and an unflinching museum about the people who were enslaved there. Both halves matter.

**Space Center Houston** — Houston, TX · `space-center` · on `leg2-gulf`, `leg2-inland`

> The actual Apollo mission control room, restored to 1969 down to the ashtrays, and a complete Saturn V lying on its side in a building built around it.

> *Winter:* Open through the holidays except Christmas Day. Very busy that week.

**The Alamo** — San Antonio, TX · `alamo` · on `leg3-i10`, `leg3-vegas`

> Smaller than everyone expects and right in the middle of downtown. Free, and it takes an hour.

**San Antonio River Walk** — San Antonio, TX · `river-walk` · on `leg3-i10`, `leg3-vegas`

> A river one level below the street, lined with restaurants for miles. In December and early January the whole thing is strung with lights over the water and you take a boat through it.

> *Winter:* The holiday lights run through early January — you would be passing at exactly the right moment. Verify the end date before counting on it.

**Natural Bridge Caverns** — San Antonio, TX · `natural-bridge-caverns` · on `leg3-i10`, `leg3-vegas`

> The largest commercial cave in Texas, and 70°F underground no matter what the weather does.

> *Winter:* Weather-proof. A good rainy-day answer.

**Balmorhea State Park** — Toyahvale, TX · `balmorhea` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> A 1.3-acre spring-fed pool in the middle of nowhere, 72°F all year, with fish in it. Utterly surreal after four hours of West Texas.

> *Winter:* Open in winter but check — it has closed for long repair stretches. Confirm before detouring.

**Marfa Lights Viewing Area** — Marfa, TX · `marfa-lights` · on `leg3-i10`, `leg3-vegas`

> Unexplained lights on the horizon that people have been arguing about since 1883. There's an official pull-out with a viewing platform. Might see nothing. That's part of it.

> *Winter:* Needs full dark and a clear night. Only worth it if you're sleeping nearby anyway.

**Carlsbad Caverns** — Carlsbad, NM · `carlsbad` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> You walk down into it through a hole in the desert and end up 750 feet underground in a room the size of six football fields. A big detour and one of the great places on the continent.

> *Winter:* Fully weather-proof — 56°F underground always. The bat flights are summer only, so winter costs you nothing but the drive. Entry reservations required.

**White Sands National Park** — Alamogordo, NM · `white-sands` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> 275 square miles of pure white gypsum dunes. You buy a plastic saucer at the gift shop and sled down them. There is nothing like it anywhere else on earth and the detour off I-10 is worth every mile.

> *Winter:* Open in winter and the light is best then. It closes for a few hours at a time for missile range tests — check the park's closure page the morning of.

**Scenic Drive Overlook** — El Paso, TX · `franklin-mountains` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> One overlook, two countries, three states. El Paso and Ciudad Juárez spread out below as one continuous city split by a line.

> *Winter:* Best at dusk when both sides light up.

**Tombstone** — Tombstone, AZ · `tombstone` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> The OK Corral, Boot Hill, and a main street that leans hard into it. Touristy in a way that's honestly fine.

> *Winter:* Mild and pleasant in winter.

**Saguaro National Park** — Tucson, AZ · `saguaro` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> Forests of cactus fifty feet tall and two hundred years old. The loop drive at sunset is the one.

> *Winter:* Peak season — winter is the best time of year to be here.

**Pima Air & Space Museum** — Tucson, AZ · `pima-air` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> Four hundred aircraft parked in the desert, including an SR-71 and a Boeing 787. Add the bus tour of the boneyard next door — 4,000 mothballed military planes in rows.

> *Winter:* Boneyard tours are weekdays only and need advance booking.

**Desert Botanical Garden** — Phoenix, AZ · `desert-botanical` · on `leg3-i10`, `leg3-vegas`, `leg1-low`

> The best desert-plant collection anywhere, and in December they light the paths with thousands of luminarias after dark.

> *Winter:* Las Noches de las Luminarias runs through early January and needs a timed ticket.

**Joshua Tree National Park** — Cottonwood, CA · `joshua-tree` · on `leg3-i10`, `leg1-low`

> The Cottonwood entrance is right on I-10, so this is a cheap detour on the last full day. Boulder piles and the trees themselves, which look invented.

> *Winter:* Winter is the good season. Nights drop below freezing.

**Palm Springs Aerial Tramway** — Palm Springs, CA · `palm-springs-tram` · on `leg3-i10`, `leg1-low`

> Rotating cable car from the desert floor to 8,500 feet in ten minutes — from palm trees to pine snow. If you skipped Sandia, take this one.

> *Winter:* There is usually snow at the top while it's 70°F at the bottom, which is the whole trick.

**Griffith Observatory** — Los Angeles, CA · `griffith` · on `leg3-i10`

> Free, and the view of the whole basin at night is the last big thing before the drive turns into just getting home.

> *Winter:* Closed Mondays. Parking is genuinely awful — go early or late.

**Salvation Mountain** — Niland, CA · `salvation-mountain` · on `leg3-i10`

> A hillside one man covered in half a million gallons of paint over thirty years. Strange, sincere, and completely unlike anything else.

> *Winter:* Winter is the only tolerable time — it's 115°F here in summer.

**The Sixth Floor Museum** — Dallas, TX · `sixth-floor` · on `leg1-low`, `leg2-inland`

> The Texas School Book Depository, from the window itself. They preserved the corner exactly as it was found and the whole story is told from inside the room.

> *Winter:* Open through the holidays except Christmas Day. Timed tickets.

**Fort Worth Stockyards** — Fort Worth, TX · `fort-worth-stockyards` · on `leg1-low`

> A longhorn cattle drive down a brick street twice a day, every day, plus the honky-tonks around it. Cornier than Nashville and somehow better for it.

**Birmingham Civil Rights Institute** — Birmingham, AL · `birmingham-civil-rights` · on `leg2-inland`

> Across the street from the 16th Street Baptist Church and Kelly Ingram Park, where the fire hoses were turned on children in 1963. The museum and those two blocks are one thing.

> *Winter:* Closed Mondays.

**Vicksburg National Military Park** — Vicksburg, MS · `vicksburg` · on `leg2-inland`

> A 16-mile drive through the siege lines above the Mississippi, plus a Union ironclad raised out of the river mud a century later.

> *Winter:* Open year round, quiet in winter.

**Hoover Dam** — Boulder City, NV · `hoover-dam` · on `leg3-vegas`

> 726 feet of concrete wedged into Black Canyon in the middle of the Depression. You can walk out on the bypass bridge and look straight down the face of it for free.

> *Winter:* Open year round and December is the pleasant time to be here. Security screening on the dam road.

**The Strip** — Las Vegas, NV · `vegas-strip` · on `leg3-vegas`

> Whatever you think of it, there is nothing else like it, and walking it at night once is worth doing. The Bellagio fountains are free and run every half hour.

> *Winter:* Cold at night in December — colder than people expect in a desert.

**Seven Magic Mountains** — Jean, NV · `seven-magic-mountains` · on `leg3-vegas`

> Seven stacks of boulders painted in fluorescent colors standing alone in the desert south of Vegas. Ten minutes, free, and it photographs better than almost anything on the trip.

**Kelso Dunes, Mojave National Preserve** — Kelso, CA · `kelso-dunes` · on `leg3-vegas`, `leg1-i40`

> Six hundred foot sand dunes that boom audibly when you slide down them. Almost nobody stops, which is most of the appeal.

> *Winter:* Winter is the only comfortable season. Last few miles are graded dirt.

---

## Half two — the contract a replacement list must satisfy

### `data/stops.json`

```json
{ "stops": [ {
  "id":     "wigwam-motel",        // kebab-case, unique, permanent — notes,
                                   //   seen-marks and bookings are keyed to it
  "name":   "Wigwam Motel",
  "town":   "Holbrook",            // must match a key in extras.json normals
  "state":  "AZ",
  "ll":     [34.9, -110.156],      // real lat/lon. Everything positional is
                                   //   derived from this — never hand-set a mile
  "detour": 5,                     // minutes ONE WAY off the interstate
  "dwell":  15,                    // minutes on the ground
  "cost":   "Free to look",        // free text, shown as-is
  "tags":   ["route66", "motel"],
  "why":    "Fifteen concrete teepees you can actually sleep in...",
  "winter": null,                  // string or null
  "routes": ["leg1-i40"],          // which route ids it sits on
  "first":  true,                  // optional
  "big":    true                   // optional
} ] }
```

**Rules that will bite:**

1. **`mile` is computed, never authored.** The app projects `ll` onto the route
   polyline. Give it good coordinates and position takes care of itself.
2. **Anything more than 140 miles off the route is silently dropped**
   (`MAX_OFF` in `js/route.js`). A stop that never appears is usually this.
3. **`routes` must name real route ids** from the table above. Listing a stop on
   both options for a leg is fine and normal.
4. **`detour` is one way.** A 20-minute detour costs 40 minutes of driving plus
   the dwell. Getting this wrong is the easiest way to make the planner lie.
5. **`dwell` defaults to 60** if omitted. Be explicit.
6. **A stop costing more than a full driving day still places** — that was a
   fixed bug — but it eats the day. Check the Days tab after adding one.
7. **No dates, no overnight towns, no personal notes, no confirmation numbers.**
   The repo is public and should not advertise an empty house.

### Lodging is not a separate thing

A hotel is an ordinary stop with `"kind": "lodging"`. The difference is that it
**anchors the end of a day** instead of costing detour time: `buildDays` skips
lodging entirely, and each night is matched to the nearest lodging place within
45 miles. Kevin adds these in the app himself; they do not belong in a seeded
list.

### `data/route.json` — waypoints, and the winter warnings

Waypoints are the road. They are dense enough that the polyline approximates the
interstate, and **all mileage and every day split is measured off them**.

```json
{ "name": "Flagstaff", "state": "AZ", "ll": [35.198, -111.651],
  "elev": 6909, "risk": "snow",
  "note": "The most likely place on this trip to find the interstate closed." }
```

`risk` is one of `chains` · `snow` · `ice`. A waypoint carrying one shows up in
**Watch out** on the Next screen within 260 miles, and as a winter warning on any
day that crosses it. The ones that exist today:

| Point | Elev | Risk |
|---|---:|---|
| Tehachapi Pass, CA | 3,793 ft | chains |
| Flagstaff, AZ | 6,909 ft | snow |
| Continental Divide, NM | 7,275 ft | snow |
| Amarillo, TX | 3,605 ft | ice |
| Oklahoma City, OK | — | ice |
| Asheville, NC | 2,134 ft | ice |
| Tejon Pass, CA | 4,144 ft | chains |

`WIGGLE = 1.09` in `js/route.js` turns straight-line polyline miles into road
miles. Calibrated against Modesto–Raleigh (~2,750 real vs 2,771 computed) and
Houston–Modesto (~1,900 vs 1,898). **Leg 2 runs about 4% light** because it has
fewer waypoints — add waypoints there rather than touching WIGGLE.

### `data/extras.json` — three side tables, all keyed off the stop list

| Key | Keyed by | Holds | Today |
|---|---|---|---|
| `sites` | stop id | official URL | 42 entries, **best-effort and unverified** — the nps.gov ones follow a documented pattern, the commercial ones are not confirmed |
| `normals` | **town name** | `{ hi, lo }` December estimate | 55 towns. A fallback only: the app fetches real 5-year archive normals from Open-Meteo and replaces these when it has signal |
| `bookings` | stop id | `{ lead: days }` | 12 entries. Deadline = departure minus lead. With no departure date the app says so rather than inventing one |

**A new town name means a new `normals` entry**, or that stop shows no
temperatures at all until it is online.

Current bookings and their lead times:

| Stop | Book this many days ahead |
|---|---:|
| Biltmore Estate | 45 |
| The French Quarter | 60 |
| Grand Canyon, South Rim | 45 |
| Carlsbad Caverns | 14 |
| Georgia Aquarium | 14 |
| Desert Botanical Garden | 21 |
| Pima Air & Space Museum | 21 |
| Dollywood | 14 |
| Graceland | 7 |
| Space Center Houston | 7 |
| The Sixth Floor Museum | 7 |
| Balmorhea State Park | 30 |

---

## What actually makes a good list here

Not opinion — this is what the app rewards, because of how it computes.

1. **Time is the currency, not distance.** The day planner budgets
   `detour × 2 + dwell` against a driving day. A 3-hour stop is a third of a day.
   Twelve honest 30-minute stops beat four aspirational 3-hour ones.
2. **Stops on the road beat stops near the road.** Petrified Forest works
   because its park road runs parallel to I-40 and rejoins it, so the detour is
   nearly free. That property is worth hunting for.
3. **Ada has never left California.** A `first` is worth more than a better
   version of something she can see at home.
4. **Late December closes things.** Anything seasonal needs a `winter` note or it
   should not be on the list. Verified so far: Grand Canyon South Rim open all
   winter (North closed Dec–May), Carlsbad and White Sands open and good, Blue
   Ridge Parkway closes for ice, San Antonio River Walk lit into January.
5. **Both route options need covering.** A leg with 36 stops on one option and 7
   on the other makes the alternative feel like a punishment.
6. **The `why` is the feature.** One or two sentences that make the case, in plain
   sentence case. It is the only thing on the place sheet arguing for the time.

## Still unanswered, and it blocks real planning

- **Which city in North Carolina.** Only the last ~300 miles change, but the
  final overnight and the last day split depend on it.
- **Departure date.** Drives the countdown, every booking deadline, and whether
  weather shows a forecast or a normal.
- **Hotels or camping.** Changes what an overnight town has to have.
- **How many spare days.** This is the actual winter plan — a closed I-40 at
  Flagstaff is absorbed by slack or by nothing.

---

*Generated from `data/stops.json`, `data/route.json` and `data/extras.json` at
Milepost 1.3.1. Repo: `scenicprints/milepost` (public).*
