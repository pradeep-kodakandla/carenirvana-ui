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
exports.HeaderService = void 0;
var core_1 = require("@angular/core");
var HeaderService = function () {
    var _classDecorators = [(0, core_1.Injectable)({
            providedIn: 'root'
        })];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var HeaderService = _classThis = /** @class */ (function () {
        function HeaderService_1(router) {
            this.router = router;
            this.dynamicTabs = [];
            this.selectedTabRoute = null; // Track selected tab
        }
        HeaderService_1.prototype.addTab = function (label, route, memberId) {
            if (!this.dynamicTabs.some(function (tab) { return tab.route === route; })) {
                this.dynamicTabs.push({ label: label, route: route, memberId: memberId });
            }
            this.selectTab(route); // Select tab when added
        };
        HeaderService_1.prototype.removeTab = function (route) {
            this.dynamicTabs = this.dynamicTabs.filter(function (tab) { return tab.route !== route; });
            // ✅ If no tabs remain, redirect to the dashboard
            if (this.dynamicTabs.length === 0) {
                this.selectedTabRoute = null;
                this.router.navigate(['/dashboard']); // Redirect to dashboard
            }
            else {
                // ✅ If tabs exist, select the first one
                this.selectedTabRoute = this.dynamicTabs[0].route;
                this.router.navigate([this.selectedTabRoute]); // Redirect to the first tab
            }
        };
        HeaderService_1.prototype.getTabs = function () {
            return this.dynamicTabs;
        };
        HeaderService_1.prototype.selectTab = function (route) {
            this.selectedTabRoute = route;
        };
        HeaderService_1.prototype.getSelectedTab = function () {
            return this.selectedTabRoute;
        };
        HeaderService_1.prototype.getMemberId = function (route) {
            var _a;
            return (_a = this.dynamicTabs.find(function (tab) { return tab.route === route; })) === null || _a === void 0 ? void 0 : _a.memberId;
        };
        HeaderService_1.prototype.updateTab = function (oldRoute, newTab) {
            var index = this.dynamicTabs.findIndex(function (t) { return t.route === oldRoute; });
            if (index !== -1) {
                this.dynamicTabs[index] = newTab;
            }
        };
        return HeaderService_1;
    }());
    __setFunctionName(_classThis, "HeaderService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HeaderService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HeaderService = _classThis;
}();
exports.HeaderService = HeaderService;
//# sourceMappingURL=header.service.js.map