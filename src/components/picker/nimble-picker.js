import '../../vendor/raf-polyfill';

import React from 'react';
import PropTypes from 'prop-types';
import { List } from 'react-virtualized';

import * as icons from '../../svgs';
import store from '../../utils/store';
import frequently from '../../utils/frequently';
import { deepMerge, getSanitizedData, measureScrollbar } from '../../utils';
import { uncompress } from '../../utils/data';
import { PickerPropTypes } from '../../utils/shared-props';

import Anchors from '../anchors';
import Category from '../category';
import Preview from '../preview';
import Search from '../search';
import { PickerDefaultProps } from '../../utils/shared-default-props';

const I18N = {
  search: 'Search',
  clear: 'Clear', // Accessible label on "clear" button
  notfound: 'No Emoji Found',
  skintext: 'Choose your default skin tone',
  categories: {
    search: 'Search Results',
    recent: 'Frequently Used',
    people: 'Smileys & People',
    nature: 'Animals & Nature',
    foods: 'Food & Drink',
    activity: 'Activity',
    places: 'Travel & Places',
    objects: 'Objects',
    symbols: 'Symbols',
    flags: 'Flags',
    custom: 'Custom',
  },
  categorieslabel: 'Emoji categories', // Accessible title for the list of categories
  skintones: {
    1: 'Default Skin Tone',
    2: 'Light Skin Tone',
    3: 'Medium-Light Skin Tone',
    4: 'Medium Skin Tone',
    5: 'Medium-Dark Skin Tone',
    6: 'Dark Skin Tone',
  },
};

const heightMap = {
  0: 0,
  1: 100,
  2: 1828,
  3: 496,
  4: 460,
  5: 280,
  6: 856,
  7: 676,
  8: 856,
  9: 1108,
  10: 64,
};

export default class NimblePicker extends React.PureComponent {
  constructor(props) {
    super(props);

    this.RECENT_CATEGORY = { id: 'recent', name: 'Recent', emojis: null };
    this.CUSTOM_CATEGORY = { id: 'custom', name: 'Custom', emojis: [] };
    this.SEARCH_CATEGORY = {
      id: 'search',
      name: 'Search',
      emojis: null,
      anchor: false,
    };

    if (props.data.compressed) {
      uncompress(props.data);
    }

    this.heightMap = props.heightMap || heightMap;
    this.totalHeight = Object.values(this.heightMap).reduce((prev, curr) => {
      return prev + curr;
    }, 0);

    this.data = props.data;
    this.i18n = deepMerge(I18N, props.i18n);
    this.icons = deepMerge(icons, props.icons);
    this.state = {
      skin: props.skin || store.get('skin') || props.defaultSkin,
      firstRender: true,
    };

    this.categories = [];
    let allCategories = [].concat(this.data.categories);

    if (props.custom.length > 0) {
      this.CUSTOM_CATEGORY.emojis = props.custom.map((emoji) => {
        return {
          ...emoji,
          // `<Category />` expects emoji to have an `id`.
          id: emoji.short_names[0],
          custom: true,
        };
      });

      allCategories.push(this.CUSTOM_CATEGORY);
    }

    this.hideRecent = true;

    if (props.include != undefined) {
      allCategories.sort((a, b) => {
        if (props.include.indexOf(a.id) > props.include.indexOf(b.id)) {
          return 1;
        }

        return -1;
      });
    }

    for (
      let categoryIndex = 0;
      categoryIndex < allCategories.length;
      categoryIndex++
    ) {
      const category = allCategories[categoryIndex];
      let isIncluded =
        props.include && props.include.length
          ? props.include.indexOf(category.id) > -1
          : true;
      let isExcluded =
        props.exclude && props.exclude.length
          ? props.exclude.indexOf(category.id) > -1
          : false;
      if (!isIncluded || isExcluded) {
        continue;
      }

      if (props.emojisToShowFilter) {
        let newEmojis = [];

        const { emojis } = category;
        for (let emojiIndex = 0; emojiIndex < emojis.length; emojiIndex++) {
          const emoji = emojis[emojiIndex];
          if (props.emojisToShowFilter(this.data.emojis[emoji] || emoji)) {
            newEmojis.push(emoji);
          }
        }

        if (newEmojis.length) {
          let newCategory = {
            emojis: newEmojis,
            name: category.name,
            id: category.id,
          };

          this.categories.push(newCategory);
        }
      } else {
        this.categories.push(category);
      }
    }

    let includeRecent =
      props.include && props.include.length
        ? props.include.indexOf(this.RECENT_CATEGORY.id) > -1
        : true;
    let excludeRecent =
      props.exclude && props.exclude.length
        ? props.exclude.indexOf(this.RECENT_CATEGORY.id) > -1
        : false;
    if (includeRecent && !excludeRecent) {
      this.hideRecent = false;
      this.categories.unshift(this.RECENT_CATEGORY);
    }

    if (this.categories[0]) {
      this.categories[0].first = true;
    }

    this.categories.unshift(this.SEARCH_CATEGORY);

    this.setAnchorsRef = this.setAnchorsRef.bind(this);
    this.handleAnchorClick = this.handleAnchorClick.bind(this);
    this.setSearchRef = this.setSearchRef.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
    this.setScrollRef = this.setScrollRef.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleScrollPaint = this.handleScrollPaint.bind(this);
    this.handleEmojiOver = this.handleEmojiOver.bind(this);
    this.handleEmojiLeave = this.handleEmojiLeave.bind(this);
    this.handleEmojiClick = this.handleEmojiClick.bind(this);
    this.handleEmojiSelect = this.handleEmojiSelect.bind(this);
    this.setPreviewRef = this.setPreviewRef.bind(this);
    this.handleSkinChange = this.handleSkinChange.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.renderCategories = this.renderCategories.bind(this);
    this.rowRender = this.rowRender.bind(this);
    this.setHeight = this.setHeight.bind(this);
    this.setListRef = this.setListRef.bind(this);
    this.callForceUpdate = this.callForceUpdate.bind(this);

    if (props.registerForceUpdate) {
      props.registerForceUpdate(this.callForceUpdate);
    }
  }

  componentWillReceiveProps(props) {
    if (props.skin) {
      this.setState({ skin: props.skin });
    } else if (props.defaultSkin && !store.get('skin')) {
      this.setState({ skin: props.defaultSkin });
    }
  }

  componentDidMount() {
    if (this.state.firstRender) {
      this.testStickyPosition();
      this.firstRenderTimeout = setTimeout(() => {
        this.setState({ firstRender: false });
      }, 60);
    }
  }

  componentDidUpdate() {
    this.updateCategoriesSize();
    this.handleScroll();
  }

  componentWillUnmount() {
    this.SEARCH_CATEGORY.emojis = null;

    clearTimeout(this.leaveTimeout);
    clearTimeout(this.firstRenderTimeout);
  }

  testStickyPosition() {
    const stickyTestElement = document.createElement('div');

    const prefixes = ['', '-webkit-', '-ms-', '-moz-', '-o-'];

    prefixes.forEach(
      (prefix) => (stickyTestElement.style.position = `${prefix}sticky`),
    );

    this.hasStickyPosition = !!stickyTestElement.style.position.length;
  }

  callForceUpdate() {
    this.forceUpdate();
    this.list.forceUpdateGrid();
  }

  handleEmojiOver(emoji) {
    var { preview } = this;
    if (!preview) {
      return;
    }

    // Use Array.prototype.find() when it is more widely supported.
    const emojiData = this.CUSTOM_CATEGORY.emojis.filter(
      (customEmoji) => customEmoji.id === emoji.id,
    )[0];
    for (let key in emojiData) {
      if (emojiData.hasOwnProperty(key)) {
        emoji[key] = emojiData[key];
      }
    }

    preview.setState({ emoji });
    clearTimeout(this.leaveTimeout);
  }

  handleEmojiLeave(emoji) {
    var { preview } = this;
    if (!preview) {
      return;
    }

    this.leaveTimeout = setTimeout(() => {
      preview.setState({ emoji: null });
    }, 16);
  }

  handleEmojiClick(emoji, e) {
    this.props.onClick(emoji, e);
    this.handleEmojiSelect(emoji);
  }

  handleEmojiSelect(emoji) {
    this.props.onSelect(emoji);
    if (!this.hideRecent && !this.props.recent) frequently.add(emoji);

    var component = this.categoryRefs['category-1'];
    if (component) {
      let maxMargin = component.maxMargin;
      component.forceUpdate();

      window.requestAnimationFrame(() => {
        if (!this.scroll) return;
        component.memoizeSize();
        if (maxMargin == component.maxMargin) return;

        this.updateCategoriesSize();
        this.handleScrollPaint();

        if (this.SEARCH_CATEGORY.emojis) {
          component.updateDisplay('none');
        }
      });
    }
  }

  handleScroll() {
    if (!this.waitingForPaint) {
      this.waitingForPaint = true;
      window.requestAnimationFrame(this.handleScrollPaint);
    }
  }

  handleScrollPaint() {
    this.waitingForPaint = false;

    if (!this.scroll) {
      return;
    }

    let activeCategory = null;

    if (this.SEARCH_CATEGORY.emojis) {
      activeCategory = this.SEARCH_CATEGORY;
    } else {
      var target = this.scroll,
        scrollTop = target.scrollTop,
        scrollingDown = scrollTop > (this.scrollTop || 0),
        minTop = 0;

      for (let i = 0, l = this.categories.length; i < l; i++) {
        let ii = scrollingDown ? this.categories.length - 1 - i : i,
          category = this.categories[ii],
          component = this.categoryRefs[`category-${ii}`];

        if (component) {
          let active = component.handleScroll(scrollTop);

          if (!minTop || component.top < minTop) {
            if (component.top > 0) {
              minTop = component.top;
            }
          }

          if (active && !activeCategory) {
            activeCategory = category;
          }
        }
      }

      if (scrollTop < minTop) {
        activeCategory = this.categories.filter(
          (category) => !(category.anchor === false),
        )[0];
      } else if (scrollTop + this.clientHeight >= this.scrollHeight) {
        activeCategory = this.categories[this.categories.length - 1];
      }
    }

    if (activeCategory) {
      let { anchors } = this,
        { name: categoryName } = activeCategory;

      if (anchors.state.selected !== categoryName) {
        anchors.setState({ selected: categoryName });
      }
    }

    this.scrollTop = scrollTop;
  }

  handleSearch(emojis) {
    this.SEARCH_CATEGORY.emojis = emojis;

    for (let i = 0, l = this.categories.length; i < l; i++) {
      let component = this.categoryRefs[`category-${i}`];

      if (component && component.props.name !== 'Search') {
        let display = emojis ? 'none' : 'inherit';
        component.updateDisplay(display);
      }
    }
    this.callForceUpdate();
    this.scroll.scrollTop = 0;
    this.handleScroll();
  }

  handleAnchorClick(category, i) {
    var component = this.categoryRefs[`category-${i}`],
      { scroll, anchors } = this,
      scrollToComponent = null;

    scrollToComponent = () => {
      if (component) {
        let { top } = component;

        if (category.first) {
          top = 0;
        } else {
          top += 1;
        }

        scroll.scrollTop = top;
      }
    };

    if (this.SEARCH_CATEGORY.emojis) {
      this.handleSearch(null);
      this.search.clear();

      window.requestAnimationFrame(scrollToComponent);
    } else {
      scrollToComponent();
    }
  }

  handleSkinChange(skin) {
    var newState = { skin: skin },
      { onSkinChange } = this.props;

    this.setState(newState);
    store.update(newState);

    onSkinChange(skin);
  }

  handleKeyDown(e) {
    let handled = false;

    switch (e.keyCode) {
      case 13:
        let emoji;

        if (
          this.SEARCH_CATEGORY.emojis &&
          this.SEARCH_CATEGORY.emojis.length &&
          (emoji = getSanitizedData(
            this.SEARCH_CATEGORY.emojis[0],
            this.state.skin,
            this.props.set,
            this.props.data,
          ))
        ) {
          this.handleEmojiSelect(emoji);
        }

        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  }

  updateCategoriesSize() {
    for (let i = 0, l = this.categories.length; i < l; i++) {
      let component = this.categoryRefs[`category-${i}`];
      if (component) component.memoizeSize();
    }

    if (this.scroll) {
      let target = this.scroll;
      this.scrollHeight = target.scrollHeight;
      this.clientHeight = target.clientHeight;
    }
  }

  getCategories() {
    if (this.SEARCH_CATEGORY.emojis) {
      return this.categories.slice(0);
    }

    return this.state.firstRender
      ? this.categories.slice(0, 3)
      : this.categories;
  }

  setAnchorsRef(c) {
    this.anchors = c;
  }

  setSearchRef(c) {
    this.search = c;
  }

  setPreviewRef(c) {
    this.preview = c;
  }

  setScrollRef(c) {
    this.scroll = c;
  }

  setListRef(c) {
    this.list = c;
  }

  setCategoryRef(name, c) {
    if (!this.categoryRefs) {
      this.categoryRefs = {};
    }

    this.categoryRefs[name] = c;
  }

  renderCategories({ index, key, style }) {
    var category = this.getCategories()[index];

    var {
      perLine,
      emojiSize,
      set,
      sheetSize,
      sheetColumns,
      sheetRows,
      native,
      backgroundImageFn,
      emojiTooltip,
      recent,
      notFound,
      notFoundEmoji,
    } = this.props;

    var { skin } = this.state;

    return (
      <Category
        ref={this.setCategoryRef.bind(this, `category-${index}`)}
        style={style}
        key={category.name}
        id={category.id}
        name={category.name}
        emojis={category.emojis}
        perLine={perLine}
        native={native}
        hasStickyPosition={this.hasStickyPosition}
        data={this.data}
        i18n={this.i18n}
        recent={category.id == this.RECENT_CATEGORY.id ? recent : undefined}
        custom={
          category.id == this.RECENT_CATEGORY.id
            ? this.CUSTOM_CATEGORY.emojis
            : undefined
        }
        emojiProps={{
          native: native,
          skin: skin,
          size: emojiSize,
          set: set,
          sheetSize: sheetSize,
          sheetColumns: sheetColumns,
          sheetRows: sheetRows,
          forceSize: native,
          tooltip: emojiTooltip,
          backgroundImageFn: backgroundImageFn,
          onOver: this.handleEmojiOver,
          onLeave: this.handleEmojiLeave,
          onClick: this.handleEmojiClick,
        }}
        notFound={notFound}
        notFoundEmoji={notFoundEmoji}
      />
    );
  }

  setHeight({ index }) {
    const { emojiSize, perLine, recent } = this.props;
    const amountOfCategories = this.getCategories().length
    const category = this.categories[index];

    if (category.id === 'search') return 0;

    let amountOfEmojis = category.emojis ? category.emojis.length : 0

    if (category.id === 'recent') {
      console.log(this.props)
    }

    const amountOfRows = Math.ceil((amountOfEmojis / perLine))
    const heightOfAllRows = amountOfRows * emojiSize + (amountOfRows * 12)
    const heightOfRowsWithHeader = heightOfAllRows + 28

    return heightOfRowsWithHeader
  }

  getPickerWidth() {
    const { emojiSize, perLine } = this.props;

    return (emojiSize + 12) * perLine
  }

  getTotalHeight() {
    return this.getCategories().reduce((accumulator, currentValue, currentIndex) => {
      return accumulator + this.setHeight({ index: currentIndex })
    }, 0)
  }

  rowRender({ index, key, style }) {
    return this.renderCategories({ index, key, style });
  }

  render() {
    var {
      perLine,
      emojiSize,
      set,
      sheetSize,
      sheetColumns,
      sheetRows,
      style,
      title,
      emoji,
      color,
      native,
      backgroundImageFn,
      emojisToShowFilter,
      showPreview,
      showSkinTones,
      include,
      exclude,
      autoFocus,
      skinEmoji,
      notFound,
      notFoundEmoji,
      recent,
      emojiTooltip,
    } = this.props,
      { skin } = this.state,
      width = perLine * (emojiSize + 12) + 12 + 2 + measureScrollbar();

    var categories = this.getCategories();

    return (
      <section
        style={{ width: width, ...style }}
        className="emoji-mart"
        aria-label={title}
        onKeyDown={this.handleKeyDown}
      >
        <div className="emoji-mart-bar">
          <Anchors
            ref={this.setAnchorsRef}
            data={this.data}
            i18n={this.i18n}
            color={color}
            categories={this.categories}
            onAnchorClick={this.handleAnchorClick}
            icons={this.icons}
          />
        </div>

        <Search
          ref={this.setSearchRef}
          onSearch={this.handleSearch}
          data={this.data}
          i18n={this.i18n}
          emojisToShowFilter={emojisToShowFilter}
          include={include}
          exclude={exclude}
          custom={this.CUSTOM_CATEGORY.emojis}
          autoFocus={autoFocus}
        />

        <div
          className="emoji-mart-scroll"
          ref={this.setScrollRef}
          onScroll={this.handleScroll}
        >
          <List
            ref={this.setListRef}
            height={this.getTotalHeight()}
            rowHeight={this.setHeight}
            deferredMeasurementCache={this._cache}
            rowCount={categories.length}
            rowRenderer={this.rowRender}
            width={this.getPickerWidth()}
            overscanRowCount={0}
          />
        </div>


        {(showPreview || showSkinTones) && (
          <div className="emoji-mart-bar">
            <Preview
              ref={this.setPreviewRef}
              data={this.data}
              title={title}
              emoji={emoji}
              showSkinTones={showSkinTones}
              showPreview={showPreview}
              emojiProps={{
                native: native,
                size: 38,
                skin: skin,
                set: set,
                sheetSize: sheetSize,
                sheetColumns: sheetColumns,
                sheetRows: sheetRows,
                backgroundImageFn: backgroundImageFn,
              }}
              skinsProps={{
                skin: skin,
                onChange: this.handleSkinChange,
                skinEmoji: skinEmoji,
              }}
              i18n={this.i18n}
            />
          </div>
        )}
      </section>
    );
  }
}

NimblePicker.propTypes /* remove-proptypes */ = {
  ...PickerPropTypes,
  data: PropTypes.object.isRequired,
};
NimblePicker.defaultProps = { ...PickerDefaultProps };
