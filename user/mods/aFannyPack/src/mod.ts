import { DependencyContainer } from "tsyringe";
import { IPostAkiLoadMod } from "@spt-aki/models/external/IPostAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";


import * as config from "../config/config.json";

class Mod implements IPostAkiLoadMod, IPostDBLoadMod 
{
    logger: ILogger
    modName: string
    modVersion: string
    container: DependencyContainer;

    constructor() 
    {
        this.modName = "Duc's Case Framework";
    }

    public postAkiLoad(container: DependencyContainer): void 
    {
        this.container = container;
    }

    public postDBLoad(container: DependencyContainer): void 
    {
        this.logger = container.resolve<ILogger>("WinstonLogger");
        this.logger.log(`[${this.modName}] : Mod loading`, "green");
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const tables = databaseServer.getTables();
        const handbook = tables.templates.handbook;
        const locales = Object.values(tables.locales.global) as Record<string, string>[];
        const defaultInventorySlots = tables.templates.items["55d7217a4bdc2d86028b456d"]._props.Slots;
        const itemID = config.id
        const itemPrefabPath = `${itemID}/case.bundle`
        const pockets = tables.templates.items["627a4e6b255f7527fb05a0f6"];

        //do a compatibility correction to make this mod work with other mods with destructive code (cough, SVM, cough)
        //basically just add the filters element back to backpacks and secure containers if they've been removed by other mods
        const compatFiltersElement = [{
            "Filter": ["54009119af1c881c07000029"],
            "ExcludedFilter": [""]
        }];

        for (const i in tables.templates.items)
        {
            if (tables.templates.items[i]._parent === "5448e53e4bdc2d60728b4567" ||
            (tables.templates.items[i]._parent === "5448bf274bdc2dfc2f8b456a"  /*Mob Container ID*/  && i !== "5c0a794586f77461c458f892"))
            {
                if (tables.templates.items[i]._props.Grids[0]._props.filters[0] === undefined)
                {
                    tables.templates.items[i]._props.Grids[0]._props.filters = compatFiltersElement;
                }
            }
        }

        const traderIDs = {
            "mechanic": "5a7c2eca46aef81a7ca2145d",
            "skier": "58330581ace78e27b8b10cee",
            "peacekeeper": "5935c25fb3acc3127c3d8cd9",
            "therapist": "54cb57776803fa99248b456e",
            "prapor": "54cb50c76803fa8b248b4571",
            "jaeger": "5c0647fdd443bc2504c2d371",
            "ragman": "5ac3b934156ae10c4430e83c"
        };

        const currencyIDs = {
            "roubles": "5449016a4bdc2d6f028b456f",
            "euros": "569668774bdc2da2298b4568",
            "dollars": "5696686a4bdc2da3298b456a"
        };

        //clone a case (SICC Case)
        const item = jsonUtil.clone(tables.templates.items["56e33680d2720be2748b4576"]);
        let itemParent = item._parent;

        //push item into equipment slots filters per the config and swap parent ID's if needed
        for (const configSlot in config.allow_in_slots)
        {
            for (const slot in defaultInventorySlots)
            {
                if (config.allow_in_slots[configSlot] === defaultInventorySlots[slot]._name)
                {
                    defaultInventorySlots[slot]._props.filters[0].Filter.push(itemID);
                }
            }
            if (config.allow_in_slots[configSlot] === "TacticalVest")
            {
                itemParent = "5448e5284bdc2dcb718b4567";
            } 
            if (config.allow_in_slots[configSlot] === "Backpack")
            {
                itemParent = "5448e53e4bdc2d60728b4567";
            } 
            if (config.allow_in_slots[configSlot] === "SecuredContainer")
            {
                itemParent = "5448bf274bdc2dfc2f8b456a";
            }
        }        
        
        item._id = itemID;
        item._props.Prefab.path = itemPrefabPath;
        item._parent = itemParent;

        //call methods to set the grid cells up
        item._props.Grids = this.createGrid(container, itemID, config);

        //set external size of the container:
        item._props.Width = config.ExternalSize.width;
        item._props.Height = config.ExternalSize.height;
        item._props.InsuranceDisabled = config.insurancedisabled;
        item._props.IsAlwaysAvailableForInsurance = config.availableforinsurance;
        item._props.ExaminedByDefault = config.examinedbydefault;

        tables.templates.items[itemID] = item;
        
        //add locales
        for (const locale of locales) 
        {
            locale[`${itemID} Name`] = config.item_name;
            locale[`${itemID} ShortName`] = config.item_short_name;
            locale[`${itemID} Description`] = config.item_description;
        }



        handbook.Items.push(
            {
                "Id": itemID,
                "ParentId": itemParent,
                "Price": config.price
            }
        );

        //add to config trader's inventory
        let traderToPush = config.trader;
        Object.entries(traderIDs).forEach(([key, val]) => 
        {
            if (key === config.trader)
            {
                traderToPush = val;
            }
        })
        const trader = tables.traders[traderToPush];

        //choose currency type
        let currencyToPush = config.currency;
        Object.entries(currencyIDs).forEach(([key, val]) => 
        {
            if (key === config.currency)
            {
                currencyToPush = val;
            }
        })

        trader.assort.items.push({
            "_id": itemID,
            "_tpl": itemID,
            "parentId": "hideout",
            "slotId": "hideout",
            "upd":
            {
                "UnlimitedCount": config.unlimited_stock,
                "StackObjectsCount": config.stock_amount
            }
        });
        trader.assort.barter_scheme[itemID] = [
            [
                {
                    "count": config.price,
                    "_tpl": currencyToPush
                }
            ]
        ];
        trader.assort.loyal_level_items[itemID] = config.trader_loyalty_level;

        //allow or disallow in secure containers, backpacks, other specific items per the config
        this.allowIntoContainers(
            itemID,
            tables.templates.items,
            config.allow_in_secure_containers,
            config.allow_in_backpacks,
            config.case_allowed_in,
            config.case_disallowed_in);

        // add case to bots
        const weightingMult = 1.0
        const botTypes = [
            "usec",
            "bear",
            "pmcbot",
            "assault"
        ];
        for (const bot in tables.bots.types) 
        {
            if (botTypes.includes(bot)) 
            {
                try 
                {
                    tables.bots.types[bot].inventory.equipment.Backpack[itemID] = Math.round(tables.bots.types[bot].inventory.equipment.Backpack["56e33680d2720be2748b4576"] * weightingMult);
                //console.log(`Added ${itemID} to bot ${bot}'s tables.`);
                }
                catch (error) 
                {
                    console.log(`Error adding the item ${itemID} to bot ${bot}'s tables: ${error}`);
                }
            }
        }
          
        // add case to special slot 3
        try 
        {
            pockets._props.Slots[2]._props.filters[0].Filter.push("groovey_fannypack");
            //console.log("Item 'groovey_fannypack' successfully added to the filter.");
        }
        catch (error) 
        {
            console.log("Error adding item 'groovey_fannypack' to the filter:", error);
        }


        if ( typeof tables.templates.items["CustomPocket"] !== "undefined" ) 
        {
            if (typeof tables.templates.items["CustomPocket"]._props.Slots[2] !== "undefined") 
            {
                tables.templates.items["CustomPocket"]._props.Slots[2]._props.filters[0].Filter.push("groovey_fannypack");
            }
        }
        

        //log success!
        this.logger.log(`[${this.modName}] : ${config.item_name} loaded! Hooray!`, "green");
    }

    

    allowIntoContainers(itemID, items, secContainers, backpacks, addAllowedIn, addDisallowedIn): void 
    {

        /*const secureContainers = {
            "kappa": "5c093ca986f7740a1867ab12",
            "gamma": "5857a8bc2459772bad15db29",
            "epsilon": "59db794186f77448bc595262",
            "beta": "5857a8b324597729ab0a0e7d",
            "alpha": "544a11ac4bdc2d470e8b456a",
            "waistPouch": "5732ee6a24597719ae0c0281"
        };*/

        for (const item in items)
        {
            
            //disallow in backpacks
            if (backpacks === false)
            {
                this.allowOrDisallowIntoCaseByParent(itemID, "exclude", items[item], "5448e53e4bdc2d60728b4567");
            }

            //allow in secure containers
            if (secContainers)
            {
                this.allowOrDisallowIntoCaseByParent(itemID, "include", items[item], "5448bf274bdc2dfc2f8b456a");
            }

            //disallow in additional specific items
            for (const configItem in addDisallowedIn)
            {
                if (addDisallowedIn[configItem] === items[item]._id)
                {
                    this.allowOrDisallowIntoCaseByID(itemID, "exclude", items[item]);
                }

            }

            //allow in additional specific items
            for (const configItem in addAllowedIn)
            {
                if (addAllowedIn[configItem] === items[item]._id)
                {
                    this.allowOrDisallowIntoCaseByID(itemID, "include", items[item]);
                }
            }
        }
    }


  
    allowOrDisallowIntoCaseByParent(customItemID, includeOrExclude, currentItem, caseParent): void 
    {
        if (includeOrExclude === "exclude") 
        {
            for (const gridKey in currentItem._props.Grids) 
            {
                if (currentItem._parent === caseParent && currentItem._id !== "5c0a794586f77461c458f892") 
                {
                    const filters = currentItem._props.Grids[gridKey]._props.filters[0];
                    if (filters.ExcludedFilter === undefined) 
                    {
                        filters.ExcludedFilter = [customItemID];
                    }
                    else if (filters) 
                    {
                        filters.ExcludedFilter.push(customItemID);
                    }
                }
            }
        }

        if (includeOrExclude === "include") 
        {
            if (currentItem._parent === caseParent && currentItem._id !== "5c0a794586f77461c458f892") 
            {
                const filters = currentItem._props.Grids[0]._props.filters[0];
                if (filters.Filter === undefined) 
                {
                    filters.Filter = [customItemID];
                }
                else if (filters) 
                {
                    filters.Filter.push(customItemID);
                }
            }
        }
    }

    allowOrDisallowIntoCaseByID(customItemID, includeOrExclude, currentItem): void 
    {
        if (includeOrExclude === "exclude") 
        {
            const filters = currentItem._props.Grids[0]._props.filters[0];
            if (filters.ExcludedFilter === undefined) 
            {
                filters.ExcludedFilter = [customItemID];
            }
            else if (filters) 
            {
                filters.ExcludedFilter.push(customItemID);
            }
        }

        if (includeOrExclude === "include") 
        {
            const filters = currentItem._props.Grids[0]._props.filters[0];
            if (filters.Filter === undefined) 
            {
                filters.Filter = [customItemID];
            }
            else if (filters) 
            {
                filters.Filter.push(customItemID);
            }
        }
    }



    createGrid(container, itemID, config) 
    {
        const grids = [];
        let cellHeight = config.InternalSize["vertical_cells"];
        let cellWidth = config.InternalSize["horizontal_cells"];
        const inFilt = config.included_filter;
        const exFilt = config.excluded_filter;
        const uCcellToApply = config.cell_to_apply_filters_to;
        const uCinFilt = config.unique_included_filter;
        const uCexFilt = config.unique_excluded_filter;

        //if inFilt is empty set it to the base item id so the case will accept all items
        if (inFilt.length === 1 && inFilt[0] === "")
        {
            inFilt[0] = "54009119af1c881c07000029";
        }
        if (uCinFilt.length === 1 && uCinFilt[0] === "")
        {
            uCinFilt[0] = "54009119af1c881c07000029";
        }

        //if num of width and height cells are not the same, set case to 1x1 and throw warning msg
        if (cellHeight.length !== cellWidth.length)
        {
            cellHeight = [1];
            cellWidth = [1];
            this.logger.log(`[${this.modName}] : WARNING: number of internal and vertical cells must be the same.`, "red");
            this.logger.log(`[${this.modName}] : WARNING: setting ${config.item_name} to be 1 1x1 cell.`, "red");

        }

        for (let i = 0; i < cellWidth.length; i++) 
        {
            if ((i === uCcellToApply-1) || (uCcellToApply[i] === ("y" || "Y")))
            {
                grids.push(this.generateColumn(container, itemID, "column"+i, cellWidth[i], cellHeight[i], uCinFilt, uCexFilt));
            }
            else 
            {
                grids.push(this.generateColumn(container, itemID, "column"+i, cellWidth[i], cellHeight[i], inFilt, exFilt));
            }
        }
        return grids;
    }

    generateColumn(container: DependencyContainer, itemID, name, cellH, cellV, inFilt, exFilt) 
    {
        const hashUtil = container.resolve<HashUtil>("HashUtil")
        return {
            "_name": name,
            "_id": hashUtil.generate(),
            "_parent": itemID,
            "_props": {
                "filters": [
                    {
                        "Filter": [...inFilt],
                        "ExcludedFilter": [...exFilt]
                    }
                ],
                "cellsH": cellH,
                "cellsV": cellV,
                "minCount": 0,
                "maxCount": 0,
                "maxWeight": 0,
                "isSortingTable": false
            }
        };
    }
}

module.exports = { mod: new Mod() }
