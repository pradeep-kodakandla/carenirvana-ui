"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MyactivitiesComponent = void 0;
var core_1 = require("@angular/core");
var table_1 = require("@angular/material/table");
var paginator_1 = require("@angular/material/paginator");
var sort_1 = require("@angular/material/sort");
var rxjs_1 = require("rxjs");
var MyactivitiesComponent = function () {
    var _classDecorators = [(0, core_1.Component)({
            selector: 'app-myactivities',
            templateUrl: './myactivities.component.html',
            styleUrls: ['./myactivities.component.css']
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _paginator_decorators;
    var _paginator_initializers = [];
    var _paginator_extraInitializers = [];
    var _sort_decorators;
    var _sort_initializers = [];
    var _sort_extraInitializers = [];
    var MyactivitiesComponent = _classThis = /** @class */ (function () {
        function MyactivitiesComponent_1(fb) {
            this.fb = fb;
            /** Columns requested:
             * Module | Member | Created On | Refer To | Activity Type | Follow Up Date | Due Date | Status
             */
            this.displayedColumns = [
                'module',
                'member',
                'createdOn',
                'referredTo',
                'activityType',
                'followUpDate',
                'dueDate',
                'status'
            ];
            this.dataSource = new table_1.MatTableDataSource([]);
            this.rawData = [];
            // filter panel (keep grid empty for now)
            this.showFilters = false;
            // quick search
            this.quickSearchTerm = '';
            // due chips
            this.dueChip = null;
            this.overdueCount = 0;
            this.dueTodayCount = 0;
            this.dueFutureCount = 0;
            // expand placeholder (kept for parity)
            this.expandedElement = null;
            this.paginator = __runInitializers(this, _paginator_initializers, void 0);
            this.sort = (__runInitializers(this, _paginator_extraInitializers), __runInitializers(this, _sort_initializers, void 0));
            __runInitializers(this, _sort_extraInitializers);
            this.fb = fb;
        }
        MyactivitiesComponent_1.prototype.ngOnInit = function () {
            this.filtersForm = this.fb.group({}); // empty grid per request
            this.loadData();
        };
        MyactivitiesComponent_1.prototype.ngAfterViewInit = function () {
            this.dataSource.paginator = this.paginator;
            this.dataSource.sort = this.sort;
            // quick search across a few fields (keep payload AS-IS / PascalCase)
            this.dataSource.filterPredicate = function (row, filter) {
                var _a, _b, _c;
                var q = (filter || '').trim().toLowerCase();
                if (!q)
                    return true;
                var name = "".concat((_a = row === null || row === void 0 ? void 0 : row.FirstName) !== null && _a !== void 0 ? _a : '', " ").concat((_b = row === null || row === void 0 ? void 0 : row.LastName) !== null && _b !== void 0 ? _b : '').trim();
                var fields = [
                    row === null || row === void 0 ? void 0 : row.Module,
                    name,
                    (_c = row === null || row === void 0 ? void 0 : row.MemberId) === null || _c === void 0 ? void 0 : _c.toString(),
                    row === null || row === void 0 ? void 0 : row.UserName, // Refer To (username)
                    row === null || row === void 0 ? void 0 : row.ActivityType,
                    row === null || row === void 0 ? void 0 : row.Status
                ];
                return fields.some(function (v) { return (v !== null && v !== void 0 ? v : '').toString().toLowerCase().includes(q); });
            };
        };
        /** Wire your real service here (kept AS-IS). It should return rows with PascalCase keys:
         * Module, FirstName, LastName, MemberId, CreatedOn, ReferredTo, UserName, ActivityType,
         * FollowUpDateTime, DueDate, Status, (and optionally StatusId / ActivityTypeId).
         */
        MyactivitiesComponent_1.prototype.getMyActivities$ = function () {
            // Example stub only. Replace with your existing service call:
            // return this.myActivitiesService.getMyActivities();
            return (0, rxjs_1.of)([]);
        };
        MyactivitiesComponent_1.prototype.loadData = function () {
            var _this = this;
            this.getMyActivities$().subscribe({
                next: function (rows) {
                    _this.rawData = Array.isArray(rows) ? rows : [];
                    _this.recomputeAll();
                },
                error: function () {
                    _this.rawData = [];
                    _this.recomputeAll();
                }
            });
        };
        // UI events
        MyactivitiesComponent_1.prototype.toggleFilters = function () { this.showFilters = !this.showFilters; };
        MyactivitiesComponent_1.prototype.onQuickSearch = function (ev) {
            var _a;
            var v = (_a = ev.target.value) !== null && _a !== void 0 ? _a : '';
            this.quickSearchTerm = v.trim().toLowerCase();
            this.recomputeAll();
        };
        MyactivitiesComponent_1.prototype.setDueChip = function (which) {
            this.dueChip = which;
            this.recomputeAll();
        };
        // ===== Pipeline =====
        MyactivitiesComponent_1.prototype.recomputeAll = function () {
            var _this = this;
            this.computeDueCounts();
            var base = __spreadArray([], this.rawData, true);
            // chip filter on DueDate
            if (this.dueChip) {
                base = base.filter(function (r) {
                    var d = _this.toDate(r === null || r === void 0 ? void 0 : r.DueDate);
                    if (!d)
                        return false;
                    var cmp = _this.compareDateOnly(d, new Date());
                    if (_this.dueChip === 'OVERDUE')
                        return cmp < 0;
                    if (_this.dueChip === 'TODAY')
                        return cmp === 0;
                    return cmp > 0; // FUTURE
                });
            }
            // quick search
            this.dataSource.data = base;
            this.dataSource.filter = this.quickSearchTerm;
            if (this.paginator)
                this.paginator.firstPage();
        };
        MyactivitiesComponent_1.prototype.computeDueCounts = function () {
            var _this = this;
            var today = new Date();
            var counts = this.rawData.reduce(function (acc, r) {
                var d = _this.toDate(r === null || r === void 0 ? void 0 : r.DueDate);
                if (!d)
                    return acc;
                var cmp = _this.compareDateOnly(d, today);
                if (cmp < 0)
                    acc.overdue++;
                else if (cmp === 0)
                    acc.today++;
                else
                    acc.future++;
                return acc;
            }, { overdue: 0, today: 0, future: 0 });
            this.overdueCount = counts.overdue;
            this.dueTodayCount = counts.today;
            this.dueFutureCount = counts.future;
        };
        // ===== Date helpers =====
        MyactivitiesComponent_1.prototype.toDate = function (v) {
            if (!v)
                return null;
            var d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        };
        MyactivitiesComponent_1.prototype.compareDateOnly = function (a, b) {
            var aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
            var bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
            return aa === bb ? 0 : (aa < bb ? -1 : 1);
        };
        // ===== Template helpers =====
        MyactivitiesComponent_1.prototype.fullName = function (row) {
            var _a, _b;
            var f = (_a = row === null || row === void 0 ? void 0 : row.FirstName) !== null && _a !== void 0 ? _a : '';
            var l = (_b = row === null || row === void 0 ? void 0 : row.LastName) !== null && _b !== void 0 ? _b : '';
            return "".concat(f, " ").concat(l).trim();
        };
        MyactivitiesComponent_1.prototype.getDueDateClass = function (dateVal) {
            var d = this.toDate(dateVal);
            if (!d)
                return 'due-unknown';
            var cmp = this.compareDateOnly(d, new Date());
            if (cmp < 0)
                return 'due-red';
            if (cmp === 0)
                return 'due-amber';
            return 'due-green';
        };
        MyactivitiesComponent_1.prototype.getDaysLeftLabel = function (dateVal) {
            var d = this.toDate(dateVal);
            if (!d)
                return '';
            var today = new Date();
            var one = 24 * 60 * 60 * 1000;
            var d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            var t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            var diff = Math.round((d0 - t0) / one);
            if (diff < 0)
                return "Overdue by ".concat(Math.abs(diff), "d");
            if (diff === 0)
                return 'Due today';
            return "In ".concat(diff, "d");
        };
        return MyactivitiesComponent_1;
    }());
    __setFunctionName(_classThis, "MyactivitiesComponent");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _paginator_decorators = [(0, core_1.ViewChild)(paginator_1.MatPaginator)];
        _sort_decorators = [(0, core_1.ViewChild)(sort_1.MatSort)];
        __esDecorate(null, null, _paginator_decorators, { kind: "field", name: "paginator", static: false, private: false, access: { has: function (obj) { return "paginator" in obj; }, get: function (obj) { return obj.paginator; }, set: function (obj, value) { obj.paginator = value; } }, metadata: _metadata }, _paginator_initializers, _paginator_extraInitializers);
        __esDecorate(null, null, _sort_decorators, { kind: "field", name: "sort", static: false, private: false, access: { has: function (obj) { return "sort" in obj; }, get: function (obj) { return obj.sort; }, set: function (obj, value) { obj.sort = value; } }, metadata: _metadata }, _sort_initializers, _sort_extraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        MyactivitiesComponent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return MyactivitiesComponent = _classThis;
}();
exports.MyactivitiesComponent = MyactivitiesComponent;
//# sourceMappingURL=myactivities.component.js.map