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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeaderComponent = void 0;
var core_1 = require("@angular/core");
var HeaderComponent = function () {
    var _classDecorators = [(0, core_1.Component)({
            selector: 'app-header',
            templateUrl: './header.component.html',
            styleUrl: './header.component.css'
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var HeaderComponent = _classThis = /** @class */ (function () {
        function HeaderComponent_1(router, headerService) {
            this.router = router;
            this.headerService = headerService;
            this.isHighlighted = false;
            this.selectedTabId = null;
            this.searchTerm = '';
            this.columns = [
                {
                    sections: [
                        { header: 'Search', bodyItems: ['Member', 'Provder', 'Member assignment'] },
                        { header: 'Admin', bodyItems: ['User Managmenet', 'Work Basket', 'Security Roles', 'Security Profiles', 'System Configuration'] }
                    ]
                },
                {
                    sections: [
                        { header: 'Configuration', bodyItems: ['Care Managmenet', 'Utilization Management', 'Appeals & Grievances', 'Member Services', 'Config Management', 'Provider Management'] },
                        { header: 'Rules Engine', bodyItems: ['Rules Engine Admin', 'Rules Engine Editor'] }
                    ]
                },
                {
                    sections: [
                        { header: 'Settings', bodyItems: ['Add Member', 'Call Tracker'] },
                        { header: 'Manage', bodyItems: ['Print Queue', 'Knowledge Library', 'External Links', 'Member Merge', 'User PTO', 'Worklog Manager'] }
                    ]
                }
            ];
            this.isExpanded = false;
            this.searchQuery = '';
        }
        HeaderComponent_1.prototype.toggleHighlight = function () {
            this.isHighlighted = !this.isHighlighted;
        };
        HeaderComponent_1.prototype.removeHighlight = function () {
            this.isHighlighted = false;
        };
        HeaderComponent_1.prototype.onSearch = function () {
            console.log(this.searchTerm); // You can handle the search logic here, e.g., filter a list
        };
        HeaderComponent_1.prototype.clearSearch = function () {
            this.searchTerm = '';
        };
        HeaderComponent_1.prototype.goToPage = function (pageName) {
            this.router.navigate(["".concat(pageName)]);
        };
        HeaderComponent_1.prototype.selectTab = function (tab) {
            this.selectedTabId = tab.label;
        };
        //removeTab(tab: { label: string; route: string }): void {
        //  this.headerService.removeTab(tab.route);
        //}
        HeaderComponent_1.prototype.removeTab = function (tab) {
            var confirmClose = window.confirm("Are you sure you want to close the \"".concat(tab.label, "\" tab?"));
            if (confirmClose) {
                this.headerService.removeTab(tab.route);
            }
        };
        HeaderComponent_1.prototype.onAddNewTab = function () {
            var _this = this;
            var newTabIndex = this.headerService.getTabs().length + 1;
            var newTabLabel = "Member Info ".concat(newTabIndex);
            var newTabRoute = "/member-info/".concat(newTabIndex);
            this.headerService.addTab(newTabLabel, newTabRoute, '0');
            this.router.navigateByUrl('/', { skipLocationChange: true }).then(function () {
                _this.router.navigate([newTabRoute]);
            });
        };
        HeaderComponent_1.prototype.onTabClick = function (route) {
            var _this = this;
            this.headerService.selectTab(route);
            var memberId = this.headerService.getMemberId(route) || '';
            this.router.navigateByUrl('/', { skipLocationChange: true }).then(function () {
                _this.router.navigate([route], { queryParams: { memberId: memberId } });
            });
        };
        HeaderComponent_1.prototype.toggleSearch = function () {
            if (this.isExpanded == true)
                this.isExpanded = false;
            else
                this.isExpanded = true;
        };
        HeaderComponent_1.prototype.collapseSearch = function () {
            if (!this.searchQuery) {
                this.isExpanded = false;
            }
        };
        return HeaderComponent_1;
    }());
    __setFunctionName(_classThis, "HeaderComponent");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HeaderComponent = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HeaderComponent = _classThis;
}();
exports.HeaderComponent = HeaderComponent;
//# sourceMappingURL=header.component.js.map